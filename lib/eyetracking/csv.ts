// File untuk susun & download CSV

import { EYE_INDICES, IRIS_INDICES, POSE_CONDITION } from "./config";
import type { LogRow, SessionInfo } from "./types";

function fmt(v: number | boolean | string) : string {
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
    return v
}

// Skema kolom tetap untuk raw log kalibrasi.
export function buildCalibrationCsv(rows: LogRow[], session: SessionInfo): string {
  const headers: string[] = [
    "participant_id",
    "session_id",
    "pose_condition",
    "calibration_layout",
    "paired_session_id",
    "frame_index",
    "timestamp_ms",
    "timestamp_source",
    "detection_ms",
    "point_id",
    "point_order",
    "point_onset_ms",
    "t_in_point_ms",
    "phase",
    "is_fixation",
    "fixation_dispersion",
    "fixation_start_ms",
    "fixation_after_onset",
    "target_x",
    "target_y",
    "target_x_px",
    "target_y_px",
    "viewport_w",
    "viewport_h",
    "screen_w",
    "screen_h",
    "device_pixel_ratio",
    "screen_width_cm",
    "viewing_distance_cm",
    "is_fullscreen",
    "video_w",
    "video_h",
    "face_detected",
    "center_valid",
    "border_valid",
    "eyes_open",
    "face_valid",
    "left_eye_openness",
    "right_eye_openness",
  ];

  for (const i of EYE_INDICES) {
    headers.push(`eye_${i}_x`, `eye_${i}_y`, `eye_${i}_z`);
  }
  for (const i of IRIS_INDICES) {
    headers.push(`iris_${i}_x`, `iris_${i}_y`, `iris_${i}_z`);
  }
  for (let i = 0; i < 16; i++) {
    headers.push(`matrix_${i}`);
  }

  const lines = rows.map((r) => {
    const f = r.frame;
    const values: (number | boolean | string)[] = [
      session.participantId,
      session.sessionId,
      POSE_CONDITION,
      session.layoutId,
      session.pairedSessionId,
      f.frameIndex,
      f.timestamp.toFixed(3),
      f.timestampSource,
      f.detectionMs,
      r.point.pointId,
      r.point.order,
      r.point.onset.toFixed(3),
      r.tInPoint,
      r.phase,
      r.fixation.isFixation,
      r.fixation.dispersion,
      Number.isFinite(r.fixation.startMs) ? r.fixation.startMs.toFixed(3) : "",
      r.fixationAfterOnset,
      r.point.x,
      r.point.y,
      r.point.x * r.viewportW,
      r.point.y * r.viewportH,
      r.viewportW,
      r.viewportH,
      session.screenW,
      session.screenH,
      session.devicePixelRatio,
      session.screenWidthCm,
      session.viewingDistanceCm,
      r.isFullscreen,
      f.videoWidth,
      f.videoHeight,
      f.faceDetected,
      f.centerValid,
      f.borderValid,
      f.eyesOpen,
      f.faceValid,
      f.leftEyeOpenness,
      f.rightEyeOpenness,
    ];

    for (const lm of f.eyeLandmarks) values.push(lm.x, lm.y, lm.z);
    for (const lm of f.irisLandmarks) values.push(lm.x, lm.y, lm.z);
    values.push(...f.facialTransformationMatrix);

    return values.map(fmt).join(",");
  });

  return [headers.join(","), ...lines].join("\n");
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
