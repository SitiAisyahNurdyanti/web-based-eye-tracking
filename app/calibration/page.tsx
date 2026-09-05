"use client";

import { useEffect, useRef, useState } from "react";
import WebcamFaceLandmarker from "@/components/WebcamFaceLandmarker";


export default function CalibrationPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startWebcam = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Gagal mengakses webcam:", err);
        setError(
          "Webcam tidak dapat diakses. Pastikan izin kamera sudah diberikan."
        );
      }
    };

    startWebcam();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-2xl font-bold mb-6">
        Calibration - Web Eye Tracking
      </h1>

      <WebcamFaceLandmarker />
    </main>
  );
}