"use client";

import { useEffect, useState } from "react";

import { TRANSITION_MS } from "@/lib/eyetracking/config";

// Titik kalibrasi: lingkaran mengecil + titik pusat tetap.
export default function CalibrationDot({ x, y }: { x: number; y: number }) {
  const [shrunk, setShrunk] = useState(false);

  useEffect(() => {
    // Dua frame agar ukuran awal sempat ter-render sebelum transisi.
    let id2: number | null = null;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setShrunk(true));
    });

    return () => {
      cancelAnimationFrame(id1);
      if (id2 !== null) cancelAnimationFrame(id2);
    };
  }, []);

  return (
    <div
      className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <div
        className="h-10 w-10 rounded-full bg-red-500"
        style={{
          transform: shrunk ? "scale(0.35)" : "scale(1)",
          transition: `transform ${TRANSITION_MS + 300}ms ease-out`,
        }}
      />
      {/* Titik pusat tetap sebagai acuan fiksasi yang presisi */}
      <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-900" />
    </div>
  );
}
