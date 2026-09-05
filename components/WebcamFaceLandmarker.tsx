"use client";

import { useEffect, useRef, useState } from "react";
import {
  DrawingUtils,
  FaceLandmarker,
} from "@mediapipe/tasks-vision";
import { getFaceLandmarker } from "@/lib/mediapipe/faceLandmarker";

export default function WebcamFaceLandmarker() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let animationFrameId: number | null = null;
    let isMounted = true;

    const start = async () => {
      try {
        const faceLandmarker = await getFaceLandmarker();

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!videoRef.current || !isMounted) return;

        videoRef.current.srcObject = stream;

        await videoRef.current.play();

        if (isMounted) {
          setIsLoading(false);
        }

        let lastVideoTime = -1;

        const predict = () => {
          const video = videoRef.current;
          const canvas = canvasRef.current;

          if (!video || !canvas) {
            animationFrameId = requestAnimationFrame(predict);
            return;
          }

          if (video.readyState < 2) {
            animationFrameId = requestAnimationFrame(predict);
            return;
          }

          if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const context = canvas.getContext("2d");

            if (context) {
              context.clearRect(0, 0, canvas.width, canvas.height);

              try {
                const results = faceLandmarker.detectForVideo(
                    video,
                    performance.now()
                );

                if (results.faceLandmarks.length > 0) {
                    const drawingUtils = new DrawingUtils(context);

                    for (const landmarks of results.faceLandmarks) {
                    drawingUtils.drawConnectors(
                        landmarks,
                        FaceLandmarker.FACE_LANDMARKS_TESSELATION,
                        {
                        lineWidth: 1,
                        }
                    );
                    }
                }
                } catch (error) {
                console.error("Face Landmarker detection error:", error);
                }
            }
          }

          animationFrameId = requestAnimationFrame(predict);
        };

        predict();
      } catch (err) {
        console.error(err);

        if (isMounted) {
          setError("Gagal menjalankan webcam atau MediaPipe Face Landmarker.");
          setIsLoading(false);
        }
      }
    };

    start();

    return () => {
      isMounted = false;

      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      {isLoading && <p>Memuat MediaPipe...</p>}

      {error && <p className="text-red-500">{error}</p>}

      <div className="relative w-full max-w-3xl">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full rounded-lg"
        />

        <canvas
          ref={canvasRef}
          className="absolute left-0 top-0 w-full h-full pointer-events-none"
        />
      </div>
    </div>
  );
}