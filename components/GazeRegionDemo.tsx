"use client";

// Demo region pandangan secara real-time. Model Ridge dilatih di browser dari
// data kalibrasi tab ini (sessionStorage), lalu setiap frame webcam ditebak dan
// region layar yang sedang dilihat dinyalakan. Tidak ada data yang direkam.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import WebcamFaceLandmarker from "@/components/WebcamFaceLandmarker";
import { exitFullscreen } from "@/hooks/useFullscreenGuard";
import { GAZE_MODEL, GAZE_REGION } from "@/lib/eyetracking/config";
import type { EyeTrackingFrame } from "@/lib/eyetracking/types";
import { frameFeatures } from "@/lib/gaze/features";
import { GazeSmoother, regionOf, sameRegion, type Region } from "@/lib/gaze/region";
import { predictRidge } from "@/lib/gaze/ridge";
import { parseTrainingSet, readTrainingRaw, trainGazeModel } from "@/lib/gaze/training";

type GazeRegionDemoProps = {
  calSessionId: string;
  participantId?: string;
};

const noSubscribe = () => () => {};
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export default function GazeRegionDemo({ calSessionId, participantId }: GazeRegionDemoProps) {
  // sessionStorage hanya ada di browser: saat render server nilainya null.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const raw = useSyncExternalStore(noSubscribe, () => readTrainingRaw(calSessionId), () => null);
  const trainingSet = useMemo(() => parseTrainingSet(raw), [raw]);
  const model = useMemo(() => (trainingSet ? trainGazeModel(trainingSet) : null), [trainingSet]);

  const [running, setRunning] = useState(false);
  const [faceIsValid, setFaceIsValid] = useState(false);
  const [showDot, setShowDot] = useState(false);
  const [region, setRegion] = useState<Region | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const runningRef = useRef(false);
  const regionRef = useRef<Region | null>(null);
  const lastValidRef = useRef(0);
  const dotRef = useRef<HTMLDivElement>(null);
  const [smoother] = useState(() => new GazeSmoother(GAZE_REGION.smoothingMs, GAZE_REGION.minSamples));

  const stop = useCallback(() => {
    runningRef.current = false;
    regionRef.current = null;
    setRegion(null);
    setRunning(false);
  }, []);

  // Esc (keluar layar penuh) atau pindah tab = selesai demo.
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && runningRef.current) stop();
    };
    const onVisibilityChange = () => {
      if (document.hidden && runningRef.current) {
        stop();
        exitFullscreen();
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [stop]);

  const handleFrame = useCallback(
    (frame: EyeTrackingFrame) => {
      if (!runningRef.current || !model) return;

      const setActive = (next: Region | null) => {
        if (!sameRegion(regionRef.current, next)) {
          regionRef.current = next;
          setRegion(next);
        }
      };

      const features = frame.faceValid ? frameFeatures(frame) : null;
      if (!features) {
        if (frame.timestamp - lastValidRef.current > GAZE_REGION.lostAfterMs) {
          smoother.reset();
          setActive(null);
          if (dotRef.current) dotRef.current.style.opacity = "0";
        }
        return;
      }
      lastValidRef.current = frame.timestamp;

      const [x, y] = predictRidge(model, features);
      const smoothed = smoother.push(frame.timestamp, x, y);
      if (!smoothed) return;

      setActive(regionOf(smoothed[0], smoothed[1], GAZE_REGION));
      // Titik tebakan digerakkan langsung lewat DOM (tanpa render ulang tiap frame).
      if (dotRef.current) {
        dotRef.current.style.left = `${clamp01(smoothed[0]) * 100}%`;
        dotRef.current.style.top = `${clamp01(smoothed[1]) * 100}%`;
        dotRef.current.style.opacity = "1";
      }
    },
    [model, smoother]
  );

  const start = async () => {
    setMessage(null);
    if (!model || !faceIsValid) return;
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      setMessage("Mode layar penuh gagal diaktifkan. Demo memerlukan layar penuh.");
      return;
    }
    smoother.reset();
    lastValidRef.current = performance.timeOrigin + performance.now();
    regionRef.current = null;
    setRegion(null);
    runningRef.current = true;
    setRunning(true);
  };

  const { cols, rows } = GAZE_REGION;

  return (
    <main className={`relative min-h-screen overflow-hidden bg-gray-100 ${running ? "cursor-none" : ""}`}>
      {/* Webcam selalu ter-mount agar kamera tidak restart saat demo dimulai. */}
      <div
        className={
          running
            ? "pointer-events-none fixed left-0 top-0 w-[640px] opacity-0"
            : "flex justify-center px-8 pt-8"
        }
      >
        <div className="w-full max-w-3xl">
          <WebcamFaceLandmarker
            showPreview={!running}
            onFaceValidChange={setFaceIsValid}
            onFrame={handleFrame}
          />
        </div>
      </div>

      {!running && (
        <div className="flex justify-center px-8 py-6">
          <div className="w-full max-w-md rounded-xl bg-white px-8 py-6 text-center shadow-lg">
            <h1 className="mb-1 text-2xl font-bold text-black">Demo Region Pandangan</h1>
            <p className="mb-4 text-xs font-medium uppercase tracking-wide text-gray-400">
              Grid {cols}×{rows} · Ridge linear (alpha {GAZE_MODEL.alpha})
            </p>

            {!hydrated ? (
              <p className="mb-4 text-sm text-gray-500">Memuat data kalibrasi...</p>
            ) : !model ? (
              <div className="mb-4 rounded-lg bg-amber-50 p-3 text-left text-sm text-amber-900">
                {trainingSet
                  ? "Frame kalibrasi valid terlalu sedikit untuk melatih model."
                  : "Data kalibrasi tidak ditemukan di tab ini. Demo memakai kalibrasi yang dijalankan di tab yang sama: lakukan kalibrasi → test grid → Coba Demo Region."}
                <div className="mt-3">
                  <Link href="/calibration-13" className="font-medium underline">
                    Mulai kalibrasi 13 titik
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <p className="mb-3 text-sm text-gray-600">
                  Layar dibagi menjadi {cols * rows} region. Region yang sedang kamu lihat akan
                  menyala. Duduk di posisi yang sama seperti saat kalibrasi. Tekan Esc untuk
                  keluar.
                </p>
                <p className="mb-4 text-xs text-gray-500">
                  Kalibrasi {calSessionId}
                  {participantId ? ` · peserta ${participantId}` : ""} · {model.nTrain} frame latih
                </p>

                <label className="mb-4 flex items-center justify-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={showDot} onChange={(e) => setShowDot(e.target.checked)} />
                  Tampilkan juga titik tebakan
                </label>

                <div className="mb-4">
                  {faceIsValid ? (
                    <p className="font-medium text-green-600">✓ Posisi wajah sesuai</p>
                  ) : (
                    <p className="font-medium text-red-500">✕ Sesuaikan posisi wajah</p>
                  )}
                </div>

                {message && <p className="mb-4 text-sm text-red-500">{message}</p>}

                <button
                  onClick={start}
                  disabled={!faceIsValid}
                  className={`rounded-lg px-6 py-3 font-medium text-white ${
                    faceIsValid ? "bg-blue-600 hover:bg-blue-700" : "cursor-not-allowed bg-gray-400"
                  }`}
                >
                  Mulai Demo
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {running && (
        <div
          className="fixed inset-0 z-20 grid bg-gray-100"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
          }}
        >
          {Array.from({ length: cols * rows }, (_, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const active = region?.col === col && region?.row === row;
            return (
              <div
                key={i}
                className={`border border-gray-300 transition-colors duration-150 ${
                  active ? "bg-blue-500/40" : "bg-transparent"
                }`}
              />
            );
          })}

          <div
            ref={dotRef}
            className={`pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-500 ${
              showDot ? "" : "hidden"
            }`}
            style={{ opacity: 0 }}
          />

          {!region && (
            <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-lg text-gray-500">
              Menunggu wajah terdeteksi...
            </p>
          )}
          <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-gray-400">
            Esc untuk keluar
          </p>
        </div>
      )}
    </main>
  );
}
