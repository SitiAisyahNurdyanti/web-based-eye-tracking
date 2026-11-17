# Web Eye Tracking

Aplikasi web untuk mengumpulkan data kalibrasi eye tracking menggunakan webcam.
Landmark mata, iris, dan pose kepala dideteksi dengan MediaPipe Face Landmarker,
dipasangkan dengan posisi titik target di layar, lalu diekspor sebagai CSV untuk
melatih model estimasi tatapan (gaze).

## Setup di laptop baru (mis. laptop penelitian)

Syarat: **Node.js 20.9 atau lebih baru** (laptop pengembangan memakai Node 22.21,
npm 10.9), Git, Google Chrome, dan koneksi internet (model MediaPipe diunduh saat
halaman dibuka).

```bash
# 1. Ambil kode (pertama kali: git clone <url-repo>, berikutnya cukup pull)
git pull

# 2. Pasang library persis sesuai package-lock.json
npm ci

# 3. Build lalu jalankan versi produksi
npm run build
npm start
```

Buka [http://localhost:3000](http://localhost:3000), lalu pilih jenis kalibrasi.
Browser harus diberi izin akses kamera. Webcam hanya bisa diakses dari
`localhost` atau `https`, jadi website harus dijalankan di laptop yang sama
dengan webcam peserta.

Untuk pengembangan (bukan pengambilan data), pakai `npm run dev`.

### Checklist sebelum setiap sesi

1. Pakai `npm start`, bukan `npm run dev` (mode dev menampilkan tombol "Issue"
   Next.js yang bisa mengganggu peserta).
2. Zoom browser 100% (**Ctrl + 0**).
3. Ukur **lebar layar** laptop yang dipakai (area tampilan, tanpa bingkai) dan
   **jarak mata–layar** (protokol: 45, 50, 55, dan 60 cm per peserta), lalu isi angka sebenarnya di form.
4. Pakai ID peserta baru dan unik (mis. `PL01`).
5. Alur: `/calibration-13` → Download CSV → Lanjut ke Test Grid → Download CSV →
   (opsional) Coba Demo Region. Semua langkah harus di **tab yang sama**.

| Halaman | Layout | Titik |
|---|---|---|
| `/calibration` | HV9 | grid 3×3 (10/50/90%) |
| `/calibration-13` | HV13 | grid 3×3 + 4 titik di (30,30), (70,30), (30,70), (70,70) |
| `/test-grid` | TEST12 | **data uji**: grid 4×3, x = 20/40/60/80%, y = 20/50/80% |
| `/gaze-demo` | – | demo region pandangan real-time (tidak merekam data) |

**Test grid** dibuka lewat tombol "Lanjut ke Test Grid" di layar ringkasan
kalibrasi (aktif setelah CSV kalibrasi diunduh). ID partisipan, lebar layar,
jarak duduk, dan `session_id` kalibrasi terbawa lewat URL, lalu dicatat di kolom
`paired_session_id`. File hasilnya `test_TEST12_<sessionId>.csv`. Titik test
tidak sama dengan titik HV9/HV13 mana pun, dan jarak rata-rata ke titik
kalibrasi terdekat sama untuk kedua layout (3,2°), sehingga perbandingan
9 vs 13 titik tidak bias.

Layout HV13 mengikuti pola 13 titik SR Research (Experiment Builder User Manual
v2.3.1, 2020, hlm. 78–79). Titik 1–9 pada HV13 identik dengan HV9 (posisi dan
`point_id`), sehingga model 9 titik bisa dilatih dari rekaman 13 titik dengan
memilih `point_id <= 9`. File CSV diberi nama `calibration_<HV9|HV13>_<sessionId>.csv`
dan memiliki kolom `calibration_layout`.

## Alur kalibrasi

1. **Setup**: isi ID partisipan dan posisikan wajah di dalam area panduan.
2. **Kalibrasi**: layar penuh, titik merah muncul satu per satu (urutan acak).
   Tekan Esc atau pindah tab untuk membatalkan; data sesi yang batal dibuang.
3. **Selesai**: ringkasan per titik ditampilkan, lalu dataset dapat diunduh
   sebagai `calibration_<HV9|HV13>_<sessionId>.csv`.

## Struktur

| Lokasi | Isi |
|---|---|
| `app/calibration/page.tsx`, `app/calibration-13/page.tsx` | Halaman kalibrasi 9 dan 13 titik (hanya memilih layout) |
| `components/CalibrationSession.tsx` | Alur kalibrasi bersama: setup → kalibrasi → selesai |
| `components/WebcamFaceLandmarker.tsx` | Webcam + MediaPipe, menghasilkan data per frame |
| `components/CalibrationDot.tsx` | Titik kalibrasi |
| `components/SessionSummaryCard.tsx` | Ringkasan sesi setelah selesai |
| `hooks/usePointSequence.ts` | Pengatur waktu tampil titik |
| `hooks/useFullscreenGuard.ts` | Pembatalan saat keluar layar penuh / pindah tab |
| `lib/eyetracking/config.ts` | Semua parameter penelitian (titik, durasi, ambang gatekeeper) |
| `lib/eyetracking/gatekeeper.ts` | Validasi frame: posisi wajah, batas frame, kedipan |
| `lib/eyetracking/csv.ts` | Skema kolom dan ekspor CSV |
| `lib/mediapipe/` | Pemuatan model dan indeks landmark mata/iris |
| `lib/gaze/` | Fitur gaze, Ridge linear, region, dan hasil test grid di browser |
| `components/TestRegionResultView.tsx` | Hasil test grid dalam bentuk region |
| `components/GazeRegionDemo.tsx` | Demo region real-time (`/gaze-demo`) |

## Catatan data

- Koordinat landmark mengikuti gambar asli kamera (tidak di-mirror).
  "Left" pada nama konstanta berarti sisi kiri gambar, yaitu **mata kanan
  partisipan** (landmark 33, 133, …, iris 468–472).
- Setiap frame diberi label fase: `pre_onset`, `transition` (< `TRANSITION_MS`
  setelah titik muncul), atau `fixation`. Semua frame disimpan, termasuk yang
  tidak valid; penyaringan dilakukan saat training.
- Label fixation berbasis data (I-DT online kumulatif, `lib/eyetracking/fixation.ts`):
  - `is_fixation`: posisi iris tetap dekat pusat fixation (simpangan per sumbu
    <= `FIXATION.maxDeviationU/V`) selama minimal `FIXATION.minDurationMs`.
  - `fixation_dispersion`: dispersi kelompok fixation yang sedang berjalan.
    Label juga bisa dihitung ulang di notebook dari kolom landmark.
  - `fixation_start_ms`: waktu awal fixation yang sedang berjalan.
  - `fixation_after_onset`: fixation dimulai setelah titik muncul (mata sudah
    berpindah ke titik baru). Rekomendasi seleksi data training:
    `face_valid & phase == "fixation" & fixation_after_onset`.
- Setup fisik `screen_width_cm` dan `viewing_distance_cm` dicatat per sesi untuk
  konversi error ke derajat sudut pandang:
  `deg = 2 * atan((err_px * screen_width_cm / screen_w) / (2 * viewing_distance_cm))`.

## Tampilan region (model di browser)

Tampilan ini hanya untuk umpan balik ke pengguna. **CSV penelitian tidak berubah.**

1. Setelah kalibrasi selesai, fitur dan target frame latih (fase `fixation` +
   `face_valid`, aturan A) disimpan di `sessionStorage` tab tersebut.
2. Setelah test grid selesai, model **Ridge linear** (degree 1, alpha 10, sama
   dengan `gaze-model/models/pilot_params.json` yang dikunci 15 November 2026)
   dilatih di browser. Lalu ditampilkan:
   - peta tebakan per titik test dalam bentuk region (benar = tebakan di dalam
     kotak seukuran 1 region yang berpusat di target), dan
   - error rata-rata dalam derajat.
3. Tombol **Coba Demo Region** membuka `/gaze-demo`: layar dibagi menjadi
   region, dan region yang sedang dilihat menyala (median tebakan 0,5 detik
   agar tidak berkedip).

Fitur dan model di browser sudah dicek **identik** dengan `gaze_pipeline.py` /
scikit-learn pada data pilot (selisih < 1e-13). Ukuran grid diatur di
`GAZE_REGION` (`lib/eyetracking/config.ts`). Default **4×2** dipilih dari data
pilot (notebook bagian 12).
