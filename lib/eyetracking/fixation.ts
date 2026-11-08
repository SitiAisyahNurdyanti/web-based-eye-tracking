// File deteksi fixation dengan I-DT (Dispersion-Threshold Identification)
//
// Versi online (kausal) dan kumulatif:
// - Setiap sampel baru dibandingkan dengan PUSAT (rata-rata) fixation yang
//   sedang berjalan, bukan hanya dengan 150 ms terakhir. Dengan begitu,
//   perpindahan mata yang tampak "bertahap" (landmark MediaPipe dihaluskan
//   antarframe) tetap terdeteksi sebagai akhir fixation.
// - Ambang dipisah per sumbu, karena sinyal vertikal iris jauh lebih kecil
//   daripada sinyal horizontal.
// - Satu sampel menyimpang ditoleransi sebagai noise; dua sampel berturut-turut
//   di luar ambang dianggap mata sudah berpindah.
// - Sebuah kelompok sampel dianggap fixation setelah berlangsung >= minDurationMs.

import { LEFT_IRIS_LANDMARKS, RIGHT_IRIS_LANDMARKS } from "@/lib/mediapipe/eyeLandmarks";
import { LEFT_EYE_OPENNESS, RIGHT_EYE_OPENNESS } from "./config";
import type { EyeTrackingFrame, FixationResult, LandmarkPoint } from "./types";

export type FixationParams = {
  minDurationMs: number;
  maxDeviationU: number;
  maxDeviationV: number;
  maxGapMs: number;
};

// Sudut mata diurutkan dari sisi KIRI gambar ke sisi KANAN gambar
// (cornerA -> cornerB) untuk kedua mata. Dengan urutan ini, saat partisipan
// melihat ke kanan, iris kedua mata bergeser ke arah yang sama, sehingga
// kedua mata aman dirata-rata. (Rumus inner/outer di notebook arahnya
// berlawanan antar mata, jadi tidak boleh dirata-rata.)
const EYES = [
  { a: LEFT_EYE_OPENNESS.cornerA, b: LEFT_EYE_OPENNESS.cornerB, iris: LEFT_IRIS_LANDMARKS[0] },
  { a: RIGHT_EYE_OPENNESS.cornerA, b: RIGHT_EYE_OPENNESS.cornerB, iris: RIGHT_IRIS_LANDMARKS[0] },
];

const NOT_FIXATION: FixationResult = { isFixation: false, dispersion: NaN, startMs: NaN };

function findLandmark(points: LandmarkPoint[], index: number) {
  return points.find((p) => p.index === index);
}

// Posisi pusat iris relatif terhadap garis sudut mata, dalam satuan panjang mata.
// u: sepanjang garis sudut mata (horizontal), v: tegak lurus garis (vertikal).
// Dihitung dalam piksel, lalu dibagi panjang mata, sehingga tidak bergantung
// pada jarak ke kamera dan tidak terpengaruh kemiringan kepala (roll).
export function irisPosition(frame: EyeTrackingFrame): { u: number; v: number } | null {
  const w = frame.videoWidth;
  const h = frame.videoHeight;
  let sumU = 0;
  let sumV = 0;
  let n = 0;

  for (const eye of EYES) {
    const a = findLandmark(frame.eyeLandmarks, eye.a);
    const b = findLandmark(frame.eyeLandmarks, eye.b);
    const iris = findLandmark(frame.irisLandmarks, eye.iris);
    if (!a || !b || !iris) continue;

    const ex = (b.x - a.x) * w;
    const ey = (b.y - a.y) * h;
    const dx = (iris.x - a.x) * w;
    const dy = (iris.y - a.y) * h;
    const len2 = ex * ex + ey * ey;
    if (!(len2 > 0)) continue; // juga menangkap NaN

    const u = (dx * ex + dy * ey) / len2;
    const v = (ex * dy - ey * dx) / len2;
    if (!Number.isFinite(u) || !Number.isFinite(v)) continue;

    sumU += u;
    sumV += v;
    n++;
  }

  return n > 0 ? { u: sumU / n, v: sumV / n } : null;
}

type Sample = { t: number; u: number; v: number };

export class FixationDetector {
  private readonly params: FixationParams;
  // Sampel fixation (atau calon fixation) yang sedang berjalan.
  private group: Sample[] = [];
  private sumU = 0;
  private sumV = 0;
  // Sampel di luar ambang yang belum dipastikan (noise atau perpindahan).
  private pending: Sample[] = [];

  constructor(params: FixationParams) {
    this.params = params;
  }

  reset(): void {
    this.setGroup([]);
    this.pending = [];
  }

  private setGroup(samples: Sample[]): void {
    this.group = samples;
    this.sumU = samples.reduce((s, x) => s + x.u, 0);
    this.sumV = samples.reduce((s, x) => s + x.v, 0);
  }

  private addToGroup(s: Sample): void {
    this.group.push(s);
    this.sumU += s.u;
    this.sumV += s.v;
  }

  update(frame: EyeTrackingFrame): FixationResult {
    // Frame tidak valid (kedipan, wajah keluar area) memutus fixation.
    const pos = frame.faceValid ? irisPosition(frame) : null;
    if (!pos) {
      this.reset();
      return NOT_FIXATION;
    }

    const s: Sample = { t: frame.timestamp, u: pos.u, v: pos.v };

    // Timestamp mundur atau ada frame yang hilang terlalu lama: mulai ulang.
    const last = this.pending[this.pending.length - 1] ?? this.group[this.group.length - 1];
    if (last && (s.t < last.t || s.t - last.t > this.params.maxGapMs)) {
      this.reset();
    }

    if (this.group.length === 0) {
      this.setGroup([s]);
    } else {
      const n = this.group.length;
      const centerU = this.sumU / n;
      const centerV = this.sumV / n;
      const inside =
        Math.abs(s.u - centerU) <= this.params.maxDeviationU &&
        Math.abs(s.v - centerV) <= this.params.maxDeviationV;

      if (inside) {
        // Kembali dekat pusat: sampel menyimpang sebelumnya dianggap noise.
        this.pending = [];
        this.addToGroup(s);
      } else {
        this.pending.push(s);
        // Dua sampel berturut-turut di luar ambang: mata sudah berpindah,
        // mulai kelompok baru dari sampel-sampel tersebut.
        if (this.pending.length >= 2) {
          this.setGroup(this.pending);
          this.pending = [];
        }
      }
    }

    const duration = this.group[this.group.length - 1].t - this.group[0].t;
    const isFixation = duration >= this.params.minDurationMs && this.pending.length === 0;
    if (!isFixation) return NOT_FIXATION;

    return {
      isFixation: true,
      dispersion: this.groupDispersion(),
      startMs: this.group[0].t,
    };
  }

  // Dispersi kelompok fixation saat ini: (maks u - min u) + (maks v - min v).
  private groupDispersion(): number {
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const x of this.group) {
      if (x.u < minU) minU = x.u;
      if (x.u > maxU) maxU = x.u;
      if (x.v < minV) minV = x.v;
      if (x.v > maxV) maxV = x.v;
    }
    return maxU - minU + (maxV - minV);
  }
}
