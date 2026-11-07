# Deep Diagnostic: konteks website dan Financial Case (Nov 2026)

Dokumen ini merangkum semua perubahan dan perbaikan pada Deep Diagnostic dari sesi 5-7 Nov 2026: konteks website (scraping), perombakan Financial Case, dan headline NPV. Keputusan desain berasal dari pengguna produk; bagian "Belum dikerjakan" sengaja ditunda.

## 1. Ringkasan

| Area | Sebelum | Sesudah |
|---|---|---|
| Konteks | Hanya jawaban kuesioner | Website perusahaan di-scrape (opsional) menjadi konteks dan insight tambahan |
| Biaya di kalkulasi | Plan Aivory dihitung sebagai biaya | Plan Aivory = rekomendasi di luar angka; biaya = transformasi aktual pengguna |
| Upah | Benchmark upah per negara | Pengguna mengisi upah per jam sendiri |
| Jam manual | Satu angka untuk seluruh tim | Jam per orang x jumlah orang |
| Headline | ROI (sering ">999%") | Payback dan NPV; ROI sebagai pendamping |
| Laporan lama | Angka lama bercampur logika baru | Dihitung ulang saat dibuka |

## 2. Konteks website (ADR-022, repo AVRY-V2-Main)

- Obscura di VPS produksi mengambil halaman website (`fetch --dump markdown|links --stealth`; jaringan privat diblokir).
- Hasil lewat ekstraktor dengan skema tertutup menjadi `website_context` dan `website_insights` (poin penting ditebalkan dengan `**`, PR #112).
- Pertahanan prompt injection: konten halaman diperlakukan sebagai data, skema tertutup, dan insight dibersihkan sebelum disimpan.
- Fallback: jika website kosong atau gagal, diagnostic berjalan seperti biasa tanpa konteks website.
- Berkas: `lib/webContext.js`, `lib/diagnosticQueue.js`, `docs/ADR-022-DEEP-DIAGNOSTIC-WEBSITE-CONTEXT.md`.
- Perbaikan UX terkait: halaman otomatis scroll ke atas saat pindah fase; batas 20 karakter pada jawaban dilonggarkan.

## 3. Perbaikan dan perombakan Financial Case (dashboard)

Urutan PR (semua di `Aivory-hub88/avry-user-dashboard`):

| PR | Perubahan | Alasan |
|---|---|---|
| #113 | Headline tidak tampak sehat bila cakupan tidak balik modal | Net savings merah/negatif bersebelahan dengan "budget left over" menyesatkan |
| #114 | Ukuran tim tidak diketahui tidak lagi default ke plan Business | Rekomendasi plan salah untuk tim kecil |
| #115 | Pengguna mengisi upah per jam sendiri | Benchmark upah salah dan tidak bisa dipertanggungjawabkan |
| #116 | Plan Aivory keluar dari kalkulasi; jadi kartu rekomendasi | Value tampak negatif saat ganti plan; plan bukan biaya dalam kasus ini |
| #117 | Laporan lama dihitung ulang saat dibuka; kartu plan membandingkan biaya dengan nilai | Halaman mencampur angka lama dan rekomendasi baru |
| #118 | Solo -> Operational; tim -> Business, di atas 200 orang dalam cakupan -> Enterprise (`lib/planForTeam.ts`) | Aturan rekomendasi plan |
| #119 | Biaya = transformasi aktual: usaha setup tim sendiri + software rekomendasi (hanya yang dihargai bila untuk seluruh tim/gratis); sisanya ditulis "tidak dihargai"; paket Aivory = satu opsi pengiriman di luar angka | Kasus bisnis harus menghitung transformasi pengguna, bukan SKU Aivory |
| #120 | Persen peningkatan per proses bisnis (`lib/processIncrements.ts`) | Pengguna ingin melihat kenaikan tiap proses |
| #121 | Kartu plan menampilkan porsi biaya sebagai fakta, tanpa merah | Fakta biasa tidak boleh tampak seperti alarm |
| #122 | Catatan bahwa ROI dan payback hanya memakai biaya yang bisa dihargai (`lib/pricedCostsOnly.ts`) | Transparansi: biaya software per kursi tidak termasuk |
| #123 | Jam manual = jam per orang x jumlah orang (`lib/teamHours.ts`, `resolveManualHours()`); field lama `manual_hours_weekly` tetap terbaca | Metode tunggal untuk tim lebih dari satu orang mengecilkan nilai |
| #124 | Headline NPV dan payback; ROI pendamping; "Sangat tinggi" menggantikan ">999%" | Kisaran ROI tiga kali ">999%" tidak informatif |
| #125 | Laporan tersimpan sebelum #124 dihitung ulang agar punya kisaran NPV; teks penjelasan menyebut kisaran NPV | Laporan lama jatuh ke kisaran ROI jenuh (tiga kali "Very high") |

Model hitung saat ini (`services/deepDiagnostic.ts`):
- `estimateRequiredInvestment` menghasilkan `RequiredInvestment` dengan `costModel: 'transformation'`, `softwareLines`, `softwareAnnualUSD`, `unpriced`, `packageUSD`.
- Headline bersih dari biaya berjalan (`headlineBasis`, `headlineNet`); biaya berjalan mulai tahun ke-2.
- Jendela ROI adaptif: diperpanjang hanya bila ada titik impas bersih nyata.
- Kisaran skenario memakai efisiensi 50% / 75% / 90%. `scenarioHorizonNPV` dan `scenarioHorizonNPVLocal` memakai profil kas yang sama dengan kisaran ROI; skenario dasar sama dengan `npvHorizonUSD`.
- `upgradeDiagnosticContext` menghitung ulang laporan tersimpan: (a) yang belum bermodel `transformation`, (b) yang belum punya `scenarioHorizonNPVLocal`. Keduanya idempoten.
- Tampilan ROI lewat `lib/roiDisplay.ts` (`formatRoi`, batas 999%).

## 4. Riset metode Big 4

Rumus internal Big 4 tidak tersedia publik. Yang ditemukan: survei Deloitte AI ROI (Okt 2025; payback tipikal 2-4 tahun, hanya 6% di bawah 1 tahun; saran memakai beberapa KPI) dan kerangka Forrester TEI (biaya, manfaat, fleksibilitas, risiko). Pola umum sumber sekunder (indikatif): TCO lengkap, manfaat bertahap, NPV dan payback dilaporkan bersama. Tidak ditemukan ambang "ROI mencurigakan", persentase contingency, atau realisasi tahun-1 yang baku, dan tidak ada yang diklaim.

## 5. Deploy dan operasional

- Dashboard di-deploy ke VPS Tencent lewat `deploy-dashboard-web-context.sh` (drift guard `EXPECT_FROM`, image rollback, health check). Terakhir: `eb5143d`.
- Bridge: `deploy-web-context.sh`. Kedua skrip belum di-track git.
- CI: gagal sesekali karena `next/font/google` (flaky); atasi dengan rerun job yang gagal, jangan `--admin`.
- Swap VPS hampir penuh (sekitar 1,98 dari 1,99 GB), tanpa swapping aktif dan tanpa OOM. `swapoff -a && swapon -a` belum dijalankan (butuh persetujuan).

## 6. Belum dikerjakan / catatan terbuka

- Tidak dipilih pengguna, jangan dikerjakan tanpa bertanya: penanda payback vs benchmark, ramp-up manfaat tahun 1, contingency untuk biaya tidak dihargai.
- Biaya software per kursi tidak dihargai, sehingga biaya terhitung lebih kecil dari aslinya dan ROI dihitung atas dasar biaya yang tidak lengkap (sudah diberi catatan di laporan).
- PDF belum memuat persen peningkatan per proses; PDF, blueprint, dan slider masih membaca field gross.
- Tampilan NPV/ROI baru belum diverifikasi manual di browser maupun PDF hasil generate.
- Opsional: host font Google sendiri agar CI tidak flaky.

## 7. Cara memeriksa

1. Buka laporan, refresh. Kisaran 3 tahun berisi tiga nominal berbeda (konservatif < dasar < optimistis), ROI di baris kecil.
2. Payback dan NPV tampil sebelum ROI; ROI tinggi tertulis "Sangat tinggi" / "Very high".
3. Tidak ada catatan "NET" bila tidak ada biaya berjalan.
4. Slider what-if memiliki tile NPV; kisaran di PDF berupa NPV.
5. Kartu plan tanpa warna merah; persen peningkatan per proses tampil.
