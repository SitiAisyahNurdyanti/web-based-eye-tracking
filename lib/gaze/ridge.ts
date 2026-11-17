// Ridge regression linear di browser, setara dengan pipeline sklearn
// di gaze-model/gaze_pipeline.py untuk degree = 1:
//   PolynomialFeatures(degree=1, include_bias=False)  -> identitas
//   StandardScaler()                                  -> (x - mean) / std
//   Ridge(alpha)                                      -> intercept tidak dipenalti
// Solusi tertutup: w = (Xc^T Xc + alpha I)^-1 Xc^T yc, intercept = mean(y) - mean(Xs)·w.
// Dua output (target_x, target_y) dilatih terpisah dengan matriks yang sama.
//
// File ini tanpa import, supaya bisa diuji langsung dengan Node.

export type RidgeModel = {
  kind: "ridge-linear";
  alpha: number;
  featureMean: number[];
  featureScale: number[];
  // coef[k] = bobot untuk output k (0 = x, 1 = y); intercept[k] idem
  coef: number[][];
  intercept: number[];
  nTrain: number;
};

function mean(values: number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

// Menyelesaikan A x = b (A simetris positif definit) dengan eliminasi Gauss + pivot.
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

export function fitRidge(X: number[][], Y: number[][], alpha: number): RidgeModel {
  const n = X.length;
  if (n < 2) throw new Error("Data latih terlalu sedikit.");
  const d = X[0].length;
  const nOut = Y[0].length;

  // StandardScaler: std populasi (ddof = 0); std 0 -> skala 1 seperti sklearn.
  const featureMean = Array.from({ length: d }, (_, j) => mean(X.map((r) => r[j])));
  const featureScale = featureMean.map((m, j) => {
    const sd = Math.sqrt(mean(X.map((r) => (r[j] - m) ** 2)));
    return sd > 0 ? sd : 1;
  });
  const Xs = X.map((r) => r.map((v, j) => (v - featureMean[j]) / featureScale[j]));

  // Ridge dengan intercept: pusatkan Xs dan Y.
  const xm = Array.from({ length: d }, (_, j) => mean(Xs.map((r) => r[j])));
  const Xc = Xs.map((r) => r.map((v, j) => v - xm[j]));

  const A = Array.from({ length: d }, (_, i) =>
    Array.from({ length: d }, (_, j) => {
      let s = 0;
      for (let r = 0; r < n; r++) s += Xc[r][i] * Xc[r][j];
      return s + (i === j ? alpha : 0);
    })
  );

  const coef: number[][] = [];
  const intercept: number[] = [];
  for (let k = 0; k < nOut; k++) {
    const ym = mean(Y.map((r) => r[k]));
    const b = Array.from({ length: d }, (_, i) => {
      let s = 0;
      for (let r = 0; r < n; r++) s += Xc[r][i] * (Y[r][k] - ym);
      return s;
    });
    const w = solve(A, b);
    coef.push(w);
    intercept.push(ym - xm.reduce((s, v, j) => s + v * w[j], 0));
  }

  return { kind: "ridge-linear", alpha, featureMean, featureScale, coef, intercept, nTrain: n };
}

// Tebakan posisi tatapan [x, y] dalam satuan 0-1 layar.
export function predictRidge(model: RidgeModel, x: number[]): [number, number] {
  const xs = x.map((v, j) => (v - model.featureMean[j]) / model.featureScale[j]);
  const out = model.coef.map(
    (w, k) => model.intercept[k] + w.reduce((s, wj, j) => s + wj * xs[j], 0)
  );
  return [out[0], out[1]];
}
