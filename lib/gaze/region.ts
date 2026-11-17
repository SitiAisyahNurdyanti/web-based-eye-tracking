// Region (kotak) di layar, penghalusan tebakan, dan error dalam derajat.

export type RegionGrid = { cols: number; rows: number };
export type Region = { col: number; row: number };

const clampIndex = (v: number, n: number) => Math.min(n - 1, Math.max(0, Math.floor(v * n)));

// Kotak tempat titik (x, y) berada; x, y dalam satuan 0-1 layar.
// Tebakan di luar layar dimasukkan ke kotak tepi terdekat.
export function regionOf(x: number, y: number, grid: RegionGrid): Region {
  return { col: clampIndex(x, grid.cols), row: clampIndex(y, grid.rows) };
}

export const sameRegion = (a: Region | null, b: Region | null) =>
  a === b || (!!a && !!b && a.col === b.col && a.row === b.row);

// Kriteria "benar" seperti notebook (bagian 12): tebakan berada di dalam kotak
// seukuran 1 region yang berpusat di target. Tidak dipengaruhi letak target
// terhadap garis grid (titik test di y = 50% tepat di garis pada grid 2 baris).
export function hitCentered(
  target: [number, number],
  pred: [number, number],
  grid: RegionGrid
): boolean {
  return (
    Math.abs(pred[0] - target[0]) < 0.5 / grid.cols &&
    Math.abs(pred[1] - target[1]) < 0.5 / grid.rows
  );
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function medianPoint(points: [number, number][]): [number, number] {
  return [median(points.map((p) => p[0])), median(points.map((p) => p[1]))];
}

// Median tebakan dalam `windowMs` terakhir (sama dengan simulasi di notebook).
export class GazeSmoother {
  private buf: { t: number; x: number; y: number }[] = [];
  private windowMs: number;
  private minSamples: number;

  constructor(windowMs: number, minSamples: number) {
    this.windowMs = windowMs;
    this.minSamples = minSamples;
  }

  push(t: number, x: number, y: number): [number, number] | null {
    this.buf.push({ t, x, y });
    while (this.buf.length && this.buf[0].t <= t - this.windowMs) this.buf.shift();
    if (this.buf.length < this.minSamples) return null;
    return medianPoint(this.buf.map((p) => [p.x, p.y]));
  }

  reset() {
    this.buf = [];
  }
}

// Error sudut (derajat) antara arah mata->target dan mata->tebakan.
// Mata diasumsikan di depan pusat layar. Sama dengan gp.angular_error_deg.
export type PhysicalSetup = { widthCm: number; heightCm: number; distanceCm: number };

export function angularErrorDeg(
  target: [number, number],
  pred: [number, number],
  s: PhysicalSetup
): number {
  const vec = (p: [number, number]) => [
    (p[0] - 0.5) * s.widthCm,
    (p[1] - 0.5) * s.heightCm,
    s.distanceCm,
  ];
  const a = vec(target);
  const b = vec(pred);
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cos = dot / (Math.hypot(...a) * Math.hypot(...b));
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}
