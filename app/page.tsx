import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-8">
      <div className="w-full max-w-md rounded-xl bg-white px-8 py-8 text-center shadow-lg">
        <h1 className="mb-2 text-2xl font-bold text-black">Web Eye Tracking</h1>

        <p className="mb-6 text-sm text-gray-600">
          Pengumpulan data kalibrasi eye tracking menggunakan webcam dan
          MediaPipe Face Landmarker.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/calibration"
            className="inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
          >
            Kalibrasi 9 Titik
          </Link>
          <Link
            href="/calibration-13"
            className="inline-block rounded-lg border border-blue-600 px-6 py-3 font-medium text-blue-700 hover:bg-blue-50"
          >
            Kalibrasi 13 Titik
          </Link>
        </div>

        <p className="mt-6 text-xs text-gray-500">
          Test grid 12 titik (data uji) dibuka lewat tombol &quot;Lanjut ke Test
          Grid&quot; setelah kalibrasi.{" "}
          <Link href="/test-grid" className="underline hover:text-gray-700">
            Buka manual
          </Link>
        </p>
      </div>
    </main>
  );
}
