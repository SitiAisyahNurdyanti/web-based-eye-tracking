// 	Layar penuh + batalkan saat Esc/pindah tab

import { useEffect, useRef } from "react";

export function exitFullscreen(): void {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }  
}

type UseFullscreenGuardOptions = {
  requireFullscreen: boolean;
  // Dipanggil dengan alasan pembatalan. Pemanggil yang menentukan
  // apakah sesi sedang berjalan (dan perlu dibatalkan) atau tidak.
  onAbort: (reason: string) => void;
}

// Pembatalan aman: keluar layar penuh (Esc) atau pindah tab.
export function useFullscreenGuard({
  requireFullscreen,
  onAbort,
}: UseFullscreenGuardOptions) {
  const onAbortRef = useRef(onAbort);
  useEffect(() => {
    onAbortRef.current = onAbort;
  }, [onAbort]);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (requireFullscreen && !document.fullscreenElement) {
        onAbortRef.current(
          "Kalibrasi dibatalkan karena keluar dari layar penuh. Data sesi ini tidak disimpan."
        );
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        onAbortRef.current(
          "Kalibrasi dibatalkan karena halaman tidak aktif. Data sesi ini tidak disimpan."
        );
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [requireFullscreen]);
}
