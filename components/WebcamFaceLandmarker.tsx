"use client";

import { useEffect, useRef, useState } from "react";
import { DrawingUtils, FaceLandmarker } from "@mediapipe/tasks-vision";

import { getFaceLandmarker } from "@/lib/mediapipe/faceLandmarker";

import {
  EYE_INDICES,
  IRIS_INDICES,
  GATEKEEPER,
} from "@/lib/eyetracking/config";
import { evaluateGatekeeper, pickLandmarks } from "@/lib/eyetracking/gatekeeper";
import type { EyeTrackingFrame } from "@/lib/eyetracking/types";

// Diekspor ulang agar import lama dari file ini tetap berfungsi.
export { EYE_INDICES, IRIS_INDICES, GATEKEEPER };
export type { EyeTrackingFrame, LandmarkPoint } from "@/lib/eyetracking/types";

type WebcamFaceLandmarkerProps = {
  showPreview?: boolean;
  onFaceValidChange?: (isValid: boolean) => void;
  // Dipanggil untuk SETIAP frame yang diproses, termasuk frame
  // tanpa wajah atau tidak valid, agar raw log lengkap.
  onFrame?: (frame: EyeTrackingFrame) => void;
};

type VideoFrameMeta = {
  mediaTime: number;
  captureTime?: number;
};

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: VideoFrameMeta) => void
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export default function WebcamFaceLandmarker({
  showPreview = true,
  onFaceValidChange,
  onFrame,
}: WebcamFaceLandmarkerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Nilai terbaru disimpan di ref supaya loop deteksi tidak perlu
  // di-restart (dan webcam tidak dimatikan) ketika props berubah.
  const showPreviewRef = useRef(showPreview);
  const faceValidCallbackRef = useRef(onFaceValidChange);
  const frameCallbackRef = useRef(onFrame);

  useEffect(() => {
    showPreviewRef.current = showPreview;
  }, [showPreview]);

  useEffect(() => {
    faceValidCallbackRef.current = onFaceValidChange;
  }, [onFaceValidChange]);

  useEffect(() => {
    frameCallbackRef.current = onFrame;
  }, [onFrame]);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Disalin di awal effect agar cleanup memakai elemen video yang sama.
    const videoEl = videoRef.current as VideoWithFrameCallback | null;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let rafId: number | null = null;
    let vfcId: number | null = null;

    let lastVideoTime = -1;
    let lastDetectTs = -1;
    let frameIndex = 0;
    let lastFaceValid: boolean | null = null;
    let drawingUtils: DrawingUtils | null = null;

    // Metadata frame terakhir dari requestVideoFrameCallback.
    let lastMeta: { mediaTime: number; captureTime: number } | null = null;

    const start = async () => {
      try {
        const faceLandmarker = await getFaceLandmarker();
        if (cancelled) return;

        const newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });

        // Cleanup bisa terjadi selama getUserMedia berjalan.
        // Hentikan stream supaya kamera tidak tetap menyala.
        if (cancelled) {
          newStream.getTracks().forEach((track) => track.stop());
          return;
        }

        stream = newStream;

        const video = videoEl;
        if (!video) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        video.srcObject = stream;
        await video.play();
        if (cancelled) return;

        setIsLoading(false);

        // ------------------------------------------------
        // Ambil waktu capture kamera jika browser mendukung.
        // ------------------------------------------------
        if (typeof video.requestVideoFrameCallback === "function") {
          const onVideoFrame = (_now: number, metadata: VideoFrameMeta) => {
            if (cancelled) return;

            const captureTime = metadata.captureTime;

            // Pakai hanya jika nilainya masuk akal
            // (timebase sama dengan performance.now()).
            if (
              typeof captureTime === "number" &&
              captureTime > 0 &&
              Math.abs(performance.now() - captureTime) < 1000
            ) {
              lastMeta = { mediaTime: metadata.mediaTime, captureTime };
            } else {
              lastMeta = null;
            }

            vfcId = video.requestVideoFrameCallback!(onVideoFrame);
          };

          vfcId = video.requestVideoFrameCallback(onVideoFrame);
        }

        // ------------------------------------------------
        // Proses satu frame
        // ------------------------------------------------
        const processFrame = () => {
          const canvas = canvasRef.current;
          if (!canvas) return;

          const w = video.videoWidth;
          const h = video.videoHeight;
          if (w === 0 || h === 0) return;

          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }

          const context = canvas.getContext("2d");
          if (!context) return;

          if (!drawingUtils) {
            drawingUtils = new DrawingUtils(context);
          }

          // Timestamp frame (epoch ms)
          let timestamp: number;
          let timestampSource: EyeTrackingFrame["timestampSource"];

          if (
            lastMeta &&
            Math.abs(lastMeta.mediaTime - video.currentTime) < 0.002
          ) {
            timestamp = performance.timeOrigin + lastMeta.captureTime;
            timestampSource = "captureTime";
          } else {
            timestamp = performance.timeOrigin + performance.now();
            timestampSource = "now";
          }

          // detectForVideo membutuhkan timestamp yang naik terus.
          let detectTs = performance.now();
          if (detectTs <= lastDetectTs) detectTs = lastDetectTs + 1;
          lastDetectTs = detectTs;

          let results;
          const t0 = performance.now();

          try {
            results = faceLandmarker.detectForVideo(video, detectTs);
          } catch (err) {
            console.error("Face Landmarker detection error:", err);
            return;
          }

          const detectionMs = performance.now() - t0;

          const landmarks = results.faceLandmarks[0];
          const faceDetected = !!landmarks && landmarks.length > 0;

          // 1. Landmark mata + iris
          const eyeLandmarks = pickLandmarks(landmarks, EYE_INDICES);
          const irisLandmarks = pickLandmarks(landmarks, IRIS_INDICES);

          // 2. Transformation matrix
          const matrix = results.facialTransformationMatrixes?.[0];
          const facialTransformationMatrix =
            faceDetected && matrix && matrix.data.length === 16
              ? Array.from(matrix.data)
              : new Array<number>(16).fill(NaN);

          // 3. Gatekeeper Evaluation
          const gate = evaluateGatekeeper(
            landmarks,
            faceDetected,
            eyeLandmarks,
            irisLandmarks,
            w,
            h
          );

          // 4. Kirim status & data frame
          if (gate.faceValid !== lastFaceValid) {
            lastFaceValid = gate.faceValid;
            faceValidCallbackRef.current?.(gate.faceValid);
          }

          frameCallbackRef.current?.({
            frameIndex: frameIndex++,
            timestamp,
            timestampSource,
            detectionMs,
            videoWidth: w,
            videoHeight: h,
            faceDetected,
            centerValid: gate.centerValid,
            borderValid: gate.borderValid,
            eyesOpen: gate.eyesOpen,
            faceValid: gate.faceValid,
            leftEyeOpenness: gate.leftEyeOpenness,
            rightEyeOpenness: gate.rightEyeOpenness,
            eyeLandmarks,
            irisLandmarks,
            facialTransformationMatrix,
          });

          // 5. Gambar landmark (hanya saat preview)
          context.clearRect(0, 0, w, h);

          if (showPreviewRef.current && faceDetected) {
            drawingUtils.drawConnectors(
              landmarks,
              FaceLandmarker.FACE_LANDMARKS_TESSELATION,
              { color: "#C0C0C070", lineWidth: 1 }
            );

            context.fillStyle = "#22d3ee";
            for (const p of eyeLandmarks) {
              context.beginPath();
              context.arc(p.x * w, p.y * h, 3, 0, 2 * Math.PI);
              context.fill();
            }

            context.fillStyle = "#f43f5e";
            for (const p of irisLandmarks) {
              context.beginPath();
              context.arc(p.x * w, p.y * h, 4, 0, 2 * Math.PI);
              context.fill();
            }
          }
        };

        // ------------------------------------------------
        // Loop utama. rAF tetap dipakai karena berjalan
        // walaupun video tidak terlihat (opacity 0).
        // ------------------------------------------------
        const loop = () => {
          if (cancelled) return;

          if (
            video.readyState >= 2 &&
            video.currentTime !== lastVideoTime
          ) {
            lastVideoTime = video.currentTime;
            processFrame();
          }

          rafId = requestAnimationFrame(loop);
        };

        loop();
      } catch (err) {
        console.error(err);
        if (cancelled) return;

        const name = err instanceof DOMException ? err.name : "";

        if (name === "NotAllowedError") {
          setError(
            "Akses kamera ditolak. Izinkan akses kamera di pengaturan browser, lalu muat ulang halaman."
          );
        } else if (name === "NotFoundError") {
          setError("Webcam tidak ditemukan. Pastikan webcam terhubung.");
        } else if (name === "NotReadableError") {
          setError("Webcam sedang dipakai aplikasi lain.");
        } else {
          setError("Gagal menjalankan webcam atau MediaPipe Face Landmarker.");
        }

        setIsLoading(false);
      }
    };

    start();

    return () => {
      cancelled = true;

      if (rafId !== null) cancelAnimationFrame(rafId);

      const video = videoEl;

      if (vfcId !== null && video?.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(vfcId);
      }

      stream?.getTracks().forEach((track) => track.stop());

      if (video) video.srcObject = null;
    };
  }, []);

  return (
    <div
      className={`relative w-full max-w-3xl ${
        showPreview ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      {isLoading && showPreview && !error && (
        <p className="mb-2 text-center text-gray-600">Memuat MediaPipe...</p>
      )}

      {error && showPreview && (
        <p className="mb-2 text-center text-red-500">{error}</p>
      )}

      <div className="relative overflow-hidden rounded-lg bg-black">
        {/*
          Preview dicerminkan (-scale-x-100) agar terasa seperti cermin
          bagi partisipan. Data landmark TIDAK dicerminkan: koordinat
          tetap mengikuti gambar asli kamera.
        */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full -scale-x-100 rounded-lg"
        />

        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute left-0 top-0 h-full w-full -scale-x-100"
        />

        {showPreview && (
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute rounded-[45%] border-4 border-white/80"
              style={{
                left: `${GATEKEEPER.guide.left * 100}%`,
                right: `${(1 - GATEKEEPER.guide.right) * 100}%`,
                top: `${GATEKEEPER.guide.top * 100}%`,
                bottom: `${(1 - GATEKEEPER.guide.bottom) * 100}%`,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
