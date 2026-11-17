// Fitur gaze per frame. Port 1:1 dari gaze-model/gaze_pipeline.py
// (landmark_xyz, rotation_matrices, derotate, extract_features), sehingga
// fitur di browser identik dengan fitur yang dipakai di skripsi.
//
// Penamaan memakai SISI PARTISIPAN:
//   R = mata kanan partisipan -> tampak di sisi KIRI gambar kamera
//   L = mata kiri partisipan  -> tampak di sisi KANAN gambar kamera
//
// File ini sengaja tanpa import runtime (hanya tipe), supaya bisa diuji
// langsung dengan Node terhadap hasil Python.

import type { EyeTrackingFrame, LandmarkPoint } from "../eyetracking/types";

export const FEATURE_NAMES = [
  "x_norm_R",
  "y_norm_R",
  "x_norm_L",
  "y_norm_L",
  "open_R",
  "open_L",
] as const;

// inner = sudut dalam (dekat hidung), outer = sudut luar (dekat telinga)
const EYES = {
  R: { inner: 133, outer: 33, iris: 468 },
  L: { inner: 362, outer: 263, iris: 473 },
} as const;

type Vec3 = [number, number, number];
type Mat3 = [Vec3, Vec3, Vec3];

function findLandmark(list: LandmarkPoint[], index: number): LandmarkPoint | undefined {
  return list.find((p) => p.index === index);
}

// Koordinat 3D dalam PIKSEL, sumbu sama dengan matriks rotasi MediaPipe:
// X = x*W, Y = -y*H (y gambar ke bawah -> dibalik), Z = -z*W.
function landmarkXyz(p: LandmarkPoint, w: number, h: number): Vec3 {
  return [p.x * w, -p.y * h, -p.z * w];
}

// facialTransformationMatrix disimpan column-major: elemen (baris i, kolom j)
// ada di indeks j*4 + i. Ambil 3x3 kiri atas = matriks rotasi R.
export function rotationMatrix(m: number[]): Mat3 {
  const r = (i: number, j: number) => m[j * 4 + i];
  return [
    [r(0, 0), r(0, 1), r(0, 2)],
    [r(1, 0), r(1, 1), r(1, 2)],
    [r(2, 0), r(2, 1), r(2, 2)],
  ];
}

// v_kepala = R^T · v_kamera (menghapus rotasi kepala).
function derotate(v: Vec3, R: Mat3): Vec3 {
  return [
    R[0][0] * v[0] + R[1][0] * v[1] + R[2][0] * v[2],
    R[0][1] * v[0] + R[1][1] * v[1] + R[2][1] * v[2],
    R[0][2] * v[0] + R[1][2] * v[1] + R[2][2] * v[2],
  ];
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// 6 fitur [x_norm_R, y_norm_R, x_norm_L, y_norm_L, open_R, open_L],
// atau null jika ada nilai yang tidak tersedia (wajah tidak terdeteksi, dsb).
export function frameFeatures(frame: EyeTrackingFrame): number[] | null {
  const w = frame.videoWidth;
  const h = frame.videoHeight;
  const m = frame.facialTransformationMatrix;
  if (!w || !h || m.length !== 16 || m.some((v) => !Number.isFinite(v))) return null;

  const R = rotationMatrix(m);
  const out: number[] = [];

  for (const eye of [EYES.R, EYES.L]) {
    const inner = findLandmark(frame.eyeLandmarks, eye.inner);
    const outer = findLandmark(frame.eyeLandmarks, eye.outer);
    const iris = findLandmark(frame.irisLandmarks, eye.iris);
    if (!inner || !outer || !iris) return null;

    const pInner = landmarkXyz(inner, w, h);
    const dIris = derotate(sub(landmarkXyz(iris, w, h), pInner), R);   // I - C
    const dOuter = derotate(sub(landmarkXyz(outer, w, h), pInner), R); // panjang mata

    const widthX = dOuter[0];
    out.push(dIris[0] / widthX);                                  // x_norm
    out.push(-(dIris[1] - 0.5 * dOuter[1]) / Math.abs(widthX));   // y_norm (positif = ke bawah)
  }

  // Bukaan mata: kolom left_eye_openness (sisi kiri gambar) = mata kanan partisipan.
  out.push(frame.leftEyeOpenness, frame.rightEyeOpenness);

  return out.every(Number.isFinite) ? out : null;
}
