// File yang memeriksa wajah valid (posisi, border, kedipan)

import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import {
  GATEKEEPER,
  LEFT_EYE_OPENNESS,
  RIGHT_EYE_OPENNESS,
} from "./config";
import type { LandmarkPoint } from "./types";

// Helper Landmark
export function pickLandmarks(
  landmarks: NormalizedLandmark[] | undefined,
  indices: number[]
): LandmarkPoint[] {
  return indices.map((index) => {
    const lm = landmarks?.[index];
    return lm
      ? { index, x: lm.x, y: lm.y, z: lm.z }
      : { index, x: NaN, y: NaN, z: NaN };
  });
}

// Rasio bukaan mata dihitung dalam piksel karena x dan y
// ternormalisasi terhadap lebar dan tinggi yang berbeda.
export function eyeOpenness(
  landmarks: NormalizedLandmark[],
  w: number,
  h: number,
  ids: { cornerA: number; cornerB: number; top: number; bottom: number }
): number {
  const a = landmarks[ids.cornerA];
  const b = landmarks[ids.cornerB];
  const t = landmarks[ids.top];
  const btm = landmarks[ids.bottom];

  if (!a || !b || !t || !btm) return NaN;

  const width = Math.hypot((b.x - a.x) * w, (b.y - a.y) * h);
  const height = Math.hypot((btm.x - t.x) * w, (btm.y - t.y) * h);

  return width > 0 ? height / width : NaN;
}

export function isInsideFrame(points: LandmarkPoint[], margin: number): boolean {
  return points.every(
    (p) =>
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      p.x >= margin &&
      p.x <= 1 - margin &&
      p.y >= margin &&
      p.y <= 1 - margin
  );
}

// GATEKEEPER EVALUATION
export type GatekeeperResult = {
  centerValid: boolean;
  borderValid: boolean;
  eyesOpen: boolean;
  faceValid: boolean;
  leftEyeOpenness: number;
  rightEyeOpenness: number;
};

export function evaluateGatekeeper(
  landmarks: NormalizedLandmark[] | undefined,
  faceDetected: boolean,
  eyeLandmarks: LandmarkPoint[],
  irisLandmarks: LandmarkPoint[],
  w: number,
  h: number
): GatekeeperResult {
  let centerValid = false;
  let borderValid = false;
  let eyesOpen = false;
  let leftEyeOpenness = NaN;
  let rightEyeOpenness = NaN;

  if (faceDetected && landmarks) {
    // a. Posisi wajah di area panduan
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const p of landmarks) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const g = GATEKEEPER.guide;

    centerValid =
      cx >= g.left && cx <= g.right && cy >= g.top && cy <= g.bottom;

    // b. Border validation: landmark mata & iris utuh di frame
    borderValid =
      isInsideFrame(eyeLandmarks, GATEKEEPER.borderMargin) &&
      isInsideFrame(irisLandmarks, GATEKEEPER.borderMargin);

    // c. Mata terbuka (bukan kedipan)
    leftEyeOpenness = eyeOpenness(landmarks, w, h, LEFT_EYE_OPENNESS);
    rightEyeOpenness = eyeOpenness(landmarks, w, h, RIGHT_EYE_OPENNESS);

    const meanOpenness = (leftEyeOpenness + rightEyeOpenness) / 2;
    eyesOpen =
      Number.isFinite(meanOpenness) &&
      meanOpenness >= GATEKEEPER.minEyeOpenness;
  }

  const faceValid = faceDetected && centerValid && borderValid && eyesOpen;

  return {
    centerValid,
    borderValid,
    eyesOpen,
    faceValid,
    leftEyeOpenness,
    rightEyeOpenness,
  };
}