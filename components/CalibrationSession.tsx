"use client";

// Halaman sesi titik lengkap (setup -> titik tampil -> selesai/batal).
// Dipakai oleh /calibration (HV9), /calibration-13 (HV13), dan
// /test-grid (TEST12, data uji). Perbedaannya hanya pada layout titik
// yang dikirim lewat props.

import { useCallback, useRef, useState } from "react";

import WebcamFaceLandmarker from "@/components/WebcamFaceLandmarker";
import CalibrationDot from "@/components/CalibrationDot";
import SessionSummaryCard from "@/components/SessionSummaryCard";

import { usePointSequence } from "@/hooks/usePointSequence";
import { exitFullscreen, useFullscreenGuard } from "@/hooks/useFullscreenGuard";

import {
  FIXATION,
  PHYSICAL_SETUP,
  POINT_DURATION_MS,
  PRE_START_DELAY_MS,
  RANDOMIZE_ORDER,
  REQUIRE_FULLSCREEN,
  TRANSITION_MS,
} from "@/lib/eyetracking/config";
import { buildCalibrationCsv, downloadCsv } from "@/lib/eyetracking/csv";
import { FixationDetector } from "@/lib/eyetracking/fixation";
import { computeSummary } from "@/lib/eyetracking/summary";
import { formatSessionTime, shuffle } from "@/lib/eyetracking/utils";
import type {
  CalibrationLayout,
  EyeTrackingFrame,
  LogRow,
  Phase,
  SessionInfo,
  SessionSummary,
  SetupPrefill,
  Stage,
} from "@/lib/eyetracking/types";

type CalibrationSessionProps = {
  layout: CalibrationLayout;
  prefill?: SetupPrefill;
};

export default function CalibrationSession({ layout, prefill }: CalibrationSessionProps) {
  const pointCount = layout.points.length;
  const isTest = layout.kind === "test";
  const pairedSessionId = prefill?.pairedSessionId ?? "";
  const sessionLabel = isTest ? "Test grid" : "Kalibrasi";

  const [stage, setStage] = useState<Stage>("setup");
  const [participantId, setParticipantId] = useState(prefill?.participantId ?? "");
  const [faceIsValid, setFaceIsValid] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Setup fisik (disimpan sebagai teks agar input bisa dikosongkan saat diketik)
  const [screenWidthCm, setScreenWidthCm] = useState(
    prefill?.screenWidthCm ?? PHYSICAL_SETUP.defaultScreenWidthCm?.toString() ?? ""
  );
  const [viewingDistanceCm, setViewingDistanceCm] = useState(
    prefill?.viewingDistanceCm ?? PHYSICAL_SETUP.defaultViewingDistanceCm.toString()
  );

  // Peringatan (tidak memblokir) jika jarak di luar rentang protokol.
  const recDist = PHYSICAL_SETUP.recommendedViewingDistanceCm;
  const typedDistance = Number(viewingDistanceCm.replace(",", "."));
  const distanceOutsideProtocol =
    viewingDistanceCm.trim() !== "" &&
    Number.isFinite(typedDistance) &&
    (typedDistance < recDist.min || typedDistance > recDist.max);

  // CSV sudah diunduh? (tombol lanjut ke test grid baru aktif setelahnya,
  // karena data sesi hilang saat pindah halaman)
  const [downloaded, setDownloaded] = useState(false);
  const [testGridHref, setTestGridHref] = useState<string | null>(null);

  // Satu detektor fixation untuk seluruh sesi (dibuat sekali).
  const [fixationDetector] = useState(() => new FixationDetector(FIXATION));

  // Semua data yang dibaca di callback per-frame disimpan di ref
  // agar tidak terkena stale closure dan tidak memicu render.
  const stageRef = useRef<Stage>("setup");
  const logRef = useRef<LogRow[]>([]);
  const sessionRef = useRef<SessionInfo | null>(null);

  const changeStage = (next: Stage) => {
    stageRef.current = next;
    setStage(next);
  };

  // Alur kalibrasi
  const finishCalibration = () => {
    sequence.stop();
    setSummary(computeSummary(logRef.current, layout.points));

    // Tautan ke test grid membawa setup sesi ini, supaya data uji
    // terpasang dengan sesi kalibrasinya.
    const session = sessionRef.current;
    if (!isTest && session) {
      const q = new URLSearchParams({
        pid: session.participantId,
        cal: session.sessionId,
        w: String(session.screenWidthCm),
        d: String(session.viewingDistanceCm),
      });
      setTestGridHref(`/test-grid?${q.toString()}`);
    }

    // Ubah stage SEBELUM keluar layar penuh agar listener
    // fullscreenchange tidak menganggapnya pembatalan.
    changeStage("finished");
    exitFullscreen();
  };

  const sequence = usePointSequence({
    pointDurationMs: POINT_DURATION_MS,
    preStartDelayMs: PRE_START_DELAY_MS,
    onFinish: finishCalibration,
  });

  const { activeDot, activePointRef } = sequence;

  // Pencatatan setiap frame (termasuk frame tidak valid)
  const handleFrame = useCallback(
    (frame: EyeTrackingFrame) => {
      if (stageRef.current !== "calibrating") return;

      // Detektor tetap diberi frame selama jeda awal (sebelum titik pertama)
      // agar jendelanya sudah terisi saat titik muncul.
      const fixation = fixationDetector.update(frame);

      const point = activePointRef.current;
      if (!point) return;

      const tInPoint = frame.timestamp - point.onset;

      // pre_onset: frame di-capture sebelum titik ini muncul
      // (masih milik tatapan ke titik sebelumnya).
      const phase: Phase =
        tInPoint < 0
          ? "pre_onset"
          : tInPoint < TRANSITION_MS
          ? "transition"
          : "fixation";

      logRef.current.push({
        frame,
        point,
        tInPoint,
        phase,
        fixation,
        fixationAfterOnset:
          fixation.isFixation && fixation.startMs >= point.onset,
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
        isFullscreen: !!document.fullscreenElement,
      });
    },
    [activePointRef, fixationDetector]
  );

  const abortCalibration = (reason: string) => {
    if (stageRef.current !== "calibrating") return;

    sequence.stop();
    fixationDetector.reset();
    logRef.current = []; // data sesi yang tidak lengkap dibuang
    setMessage(reason);
    changeStage("aborted");
    exitFullscreen();
  };

  // Pembatalan aman: keluar layar penuh (Esc) atau pindah tab
  useFullscreenGuard({
    requireFullscreen: REQUIRE_FULLSCREEN,
    onAbort: abortCalibration,
  });

  const startCalibration = async () => {
    setMessage(null);

    const pid = participantId.trim().replace(/[^A-Za-z0-9_-]/g, "");
    if (!pid) {
      setMessage("Isi ID partisipan (huruf, angka, - atau _).");
      return;
    }

    const widthCm = Number(screenWidthCm.replace(",", "."));
    const sw = PHYSICAL_SETUP.screenWidthCm;
    if (!Number.isFinite(widthCm) || widthCm < sw.min || widthCm > sw.max) {
      setMessage(`Isi lebar layar dalam cm (${sw.min}–${sw.max} cm).`);
      return;
    }

    const distanceCm = Number(viewingDistanceCm.replace(",", "."));
    const vd = PHYSICAL_SETUP.viewingDistanceCm;
    if (!Number.isFinite(distanceCm) || distanceCm < vd.min || distanceCm > vd.max) {
      setMessage(`Isi jarak mata ke layar dalam cm (${vd.min}–${vd.max} cm).`);
      return;
    }

    if (!faceIsValid) return;

    if (REQUIRE_FULLSCREEN) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        setMessage(
          `Mode layar penuh gagal diaktifkan. ${sessionLabel} memerlukan layar penuh.`
        );
        return;
      }
    }

    sessionRef.current = {
      participantId: pid,
      sessionId: `${pid}_${formatSessionTime(new Date())}`,
      layoutId: layout.id,
      pairedSessionId,
      screenW: window.screen.width,
      screenH: window.screen.height,
      devicePixelRatio: window.devicePixelRatio,
      screenWidthCm: widthCm,
      viewingDistanceCm: distanceCm,
    };
    setSessionId(sessionRef.current.sessionId);

    fixationDetector.reset();
    logRef.current = [];
    setSummary(null);
    setDownloaded(false);
    setTestGridHref(null);

    changeStage("calibrating");

    sequence.start(
      RANDOMIZE_ORDER ? shuffle(layout.points) : [...layout.points]
    );
  };

  const resetCalibration = () => {
    sequence.stop();
    fixationDetector.reset();
    logRef.current = [];
    sessionRef.current = null;
    setSessionId(null);
    setSummary(null);
    setMessage(null);
    setDownloaded(false);
    setTestGridHref(null);
    changeStage("setup");
  };

  // Ekspor CSV (skema kolom tetap)
  const downloadCSV = () => {
    const rows = logRef.current;
    const session = sessionRef.current;

    if (rows.length === 0 || !session) {
      alert(`Belum ada data ${sessionLabel.toLowerCase()}.`);
      return;
    }

    // Data uji diberi awalan "test_" agar dibaca notebook sebagai test grid.
    const prefix = isTest ? "test" : "calibration";
    downloadCsv(
      buildCalibrationCsv(rows, session),
      `${prefix}_${session.layoutId}_${session.sessionId}.csv`
    );
    setDownloaded(true);
  };

  // RENDER
  const isCalibrating = stage === "calibrating";

  return (
    <main
      className={`relative min-h-screen overflow-hidden bg-gray-100 ${
        isCalibrating ? "cursor-none" : ""
      }`}
    >
      {/* =====================================
          WEBCAM / MEDIAPIPE
          Selalu ter-mount agar kamera tidak restart.
          ===================================== */}
      <div
        className={
          isCalibrating
            ? "pointer-events-none fixed left-0 top-0 w-[640px] opacity-0"
            : stage === "setup"
            ? "flex justify-center px-8 pt-8"
            : "hidden"
        }
      >
        <div className="w-full max-w-3xl">
          <WebcamFaceLandmarker
            showPreview={stage === "setup"}
            onFaceValidChange={setFaceIsValid}
            onFrame={handleFrame}
          />
        </div>
      </div>

      {/* =====================================
          SETUP
          ===================================== */}
      {stage === "setup" && (
        <div className="flex justify-center px-8 py-6">
          <div className="w-full max-w-md rounded-xl bg-white px-8 py-6 text-center shadow-lg">
            <h1 className="mb-1 text-2xl font-bold text-black">
              {isTest ? "Test Grid" : "Kalibrasi"} {pointCount} Titik
            </h1>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Layout {layout.id}
            </p>

            <p className="mb-4 text-sm text-gray-600">
              Posisikan wajah di dalam area panduan. Selama{" "}
              {sessionLabel.toLowerCase()}, tatap titik pusat lingkaran merah
              sampai titik berpindah, dan usahakan kepala tetap diam. Tekan Esc
              untuk membatalkan.
            </p>

            {isTest && (
              <div
                className={`mb-4 rounded-lg p-3 text-left text-xs ${
                  pairedSessionId
                    ? "bg-green-50 text-green-900"
                    : "bg-amber-50 text-amber-900"
                }`}
              >
                {pairedSessionId ? (
                  <>
                    Data uji untuk sesi kalibrasi{" "}
                    <span className="font-semibold">{pairedSessionId}</span>.
                    Jangan ubah posisi duduk sejak kalibrasi.
                  </>
                ) : (
                  <>
                    Tidak terhubung dengan sesi kalibrasi. Sebaiknya buka halaman
                    ini lewat tombol &quot;Lanjut ke Test Grid&quot; setelah
                    kalibrasi, agar data uji terpasang dengan sesinya.
                  </>
                )}
              </div>
            )}

            <label className="mb-4 block text-left text-sm font-medium text-gray-700">
              ID Partisipan
              <input
                type="text"
                value={participantId}
                onChange={(e) => setParticipantId(e.target.value)}
                placeholder="contoh: P01"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
              />
            </label>

            <div className="mb-4 grid grid-cols-2 gap-3 text-left">
              <label className="block text-sm font-medium text-gray-700">
                Lebar layar (cm)
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={screenWidthCm}
                  onChange={(e) => setScreenWidthCm(e.target.value)}
                  placeholder="contoh: 34.5"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Jarak mata–layar (cm)
                <input
                  type="number"
                  inputMode="decimal"
                  step="1"
                  value={viewingDistanceCm}
                  onChange={(e) => setViewingDistanceCm(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
                />
              </label>
            </div>

            {distanceOutsideProtocol && (
              <p className="mb-4 rounded-lg bg-amber-50 p-2 text-left text-xs text-amber-900">
                Jarak {viewingDistanceCm} cm di luar protokol ({recDist.min}–
                {recDist.max} cm). Sesi tetap bisa dimulai, tetapi sebaiknya atur
                ulang posisi duduk.
              </p>
            )}

            <div className="mb-4 rounded-lg bg-blue-50 p-3 text-left text-xs text-blue-900">
              <p className="mb-1 font-semibold">Protokol pengukuran</p>
              <ol className="list-decimal space-y-0.5 pl-4">
                <li>
                  Lebar layar: ukur area tampilan (tanpa bingkai) dari kiri ke
                  kanan dengan penggaris.
                </li>
                <li>
                  Jarak: atur kursi hingga jarak mata ke layar{" "}
                  {recDist.min}–{recDist.max} cm, ukur dengan meteran, lalu isi
                  nilai sebenarnya.
                </li>
                <li>Pertahankan posisi duduk selama kalibrasi.</li>
              </ol>
            </div>

            <div className="mb-4">
              {faceIsValid ? (
                <p className="font-medium text-green-600">
                  ✓ Posisi wajah sesuai
                </p>
              ) : (
                <p className="font-medium text-red-500">
                  ✕ Sesuaikan posisi wajah
                </p>
              )}
            </div>

            {message && (
              <p className="mb-4 text-sm text-red-500">{message}</p>
            )}

            <button
              onClick={startCalibration}
              disabled={!faceIsValid}
              className={`rounded-lg px-6 py-3 font-medium text-white ${
                faceIsValid
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "cursor-not-allowed bg-gray-400"
              }`}
            >
              Mulai {sessionLabel}
            </button>
          </div>
        </div>
      )}

      {/* =====================================
          KALIBRASI
          ===================================== */}
      {isCalibrating && (
        <div className="fixed inset-0 z-20 bg-gray-100">
          {activeDot ? (
            <CalibrationDot
              key={activeDot.order}
              x={activeDot.x}
              y={activeDot.y}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-lg text-gray-500">
                Bersiap... tatap titik merah yang akan muncul.
              </p>
            </div>
          )}

          {activeDot && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-gray-400">
              {activeDot.order} / {pointCount}
            </div>
          )}
        </div>
      )}

      {/* =====================================
          DIBATALKAN
          ===================================== */}
      {stage === "aborted" && (
        <div className="flex min-h-screen items-center justify-center p-8">
          <div className="max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
            <h1 className="mb-3 text-2xl font-bold text-red-500">
              {sessionLabel} Dibatalkan
            </h1>
            <p className="mb-6 text-gray-600">{message}</p>
            <button
              onClick={resetCalibration}
              className="rounded-lg bg-gray-700 px-6 py-3 font-medium text-white hover:bg-gray-800"
            >
              Kembali
            </button>
          </div>
        </div>
      )}

      {/* =====================================
          SELESAI
          ===================================== */}
      {stage === "finished" && summary && (
        <SessionSummaryCard
          title={`${sessionLabel} Selesai`}
          summary={summary}
          sessionId={sessionId ?? undefined}
          onDownload={downloadCSV}
          onReset={resetCalibration}
          resetLabel={`Ulangi ${sessionLabel}`}
          downloaded={downloaded}
          nextHref={testGridHref ?? undefined}
          nextLabel="Lanjut ke Test Grid"
        />
      )}
    </main>
  );
}
