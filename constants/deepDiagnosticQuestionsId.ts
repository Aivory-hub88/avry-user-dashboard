import { PhaseId } from '@/types/deepDiagnostic'

/**
 * Bahasa Indonesia display copy for the Deep Diagnostic intake flow.
 *
 * This is a LABEL-ONLY translation layer over constants/deepDiagnosticQuestions.ts.
 * It never introduces new ids or changes canonical option strings — the
 * deterministic scorer/risk classifier in services/deepDiagnostic.ts and all
 * stored answers (localStorage + Postgres) continue to key on the English
 * strings in deepDiagnosticQuestions.ts, unchanged.
 *
 * `options` arrays below are positionally aligned with the canonical
 * `options` array for the same question id in deepDiagnosticQuestions.ts —
 * index i here is the Indonesian label for canonical options[i]. Consumers
 * must pair them by index, never by matching string content.
 */

interface IdPhaseCopy {
  title: string
  description: string
}

interface IdQuestionCopy {
  question: string
  helperText?: string
  placeholder?: string
  options?: string[]
}

export const ID_PHASE_COPY: Record<PhaseId, IdPhaseCopy> = {
  business_objective_kpi: {
    title: 'Tujuan Bisnis & KPI',
    description: 'Tentukan tujuan bisnis Anda dan cara Anda mengukur keberhasilannya',
  },
  data_process_readiness: {
    title: 'Operasional & Fondasi Data',
    description: 'Nilai bagaimana proses inti dan data Anda benar-benar berjalan saat ini',
  },
  risk_constraints: {
    title: 'Risiko & Kendala',
    description: 'Identifikasi risiko potensial dan kendala organisasi',
  },
  ai_opportunity_mapping: {
    title: 'Hambatan & Peluang',
    description: 'Temukan apa yang memperlambat bisnis Anda dan area mana yang perlu diperbaiki lebih dulu',
  },
}

export const ID_QUESTION_COPY: Record<string, IdQuestionCopy> = {
  // --- Phase 1: business_objective_kpi ---
  currency: {
    question: 'Mata uang apa yang ingin Anda gunakan untuk estimasi biaya dan ROI?',
    options: [
      'USD — Dolar AS ($)',
      'EUR — Euro (€)',
      'GBP — Poundsterling Inggris (£)',
      'IDR — Rupiah Indonesia (Rp)',
      'SGD — Dolar Singapura (S$)',
      'MYR — Ringgit Malaysia (RM)',
      'AUD — Dolar Australia (A$)',
      'JPY — Yen Jepang (¥)',
      'INR — Rupee India (₹)',
      'Lainnya',
    ],
  },
  industry: {
    question: 'Di industri apa perusahaan Anda beroperasi?',
    options: [
      'Teknologi / Perangkat Lunak',
      'E-commerce / Ritel',
      'Jasa Keuangan / Fintech',
      'Kesehatan / Medtech',
      'Manufaktur',
      'Makanan & Minuman',
      'Logistik / Rantai Pasok',
      'Pendidikan / Edtech',
      'Media / Hiburan',
      'Real Estat / Properti',
      'Jasa Profesional / Konsultasi',
      'Pemerintahan / Sektor Publik',
      'Nirlaba / LSM',
      'Lainnya',
    ],
  },
  company_size: {
    question: 'Berapa ukuran perusahaan Anda?',
    options: [
      'Solo / Pekerja Lepas (1 orang)',
      'Mikro (2–10 karyawan)',
      'Kecil (11–50 karyawan)',
      'Menengah (51–250 karyawan)',
      'Besar (251–1.000 karyawan)',
      'Korporasi (1.000+ karyawan)',
    ],
  },
  annual_revenue: {
    question: 'Berapa perkiraan pendapatan tahunan Anda?',
    helperText: 'Ini membantu mengkalibrasi estimasi ROI sesuai skala bisnis Anda',
    options: [
      'Belum Berpendapatan / Startup',
      'Di bawah $100K',
      '$100K – $500K',
      '$500K – $1M',
      '$1M – $5M',
      '$5M – $20M',
      '$20M – $100M',
      'Di atas $100M',
      'Tidak ingin menyebutkan',
    ],
  },
  primary_objective: {
    question: 'Apa hasil bisnis utama yang ingin Anda tingkatkan?',
    placeholder: 'Jelaskan tujuan utama Anda (mis. mengurangi biaya operasional, meningkatkan pengalaman pelanggan)',
    helperText: 'Sejelas dan sespesifik mungkin',
  },
  quantified_goal: {
    question: 'Apakah Anda memiliki target terukur untuk tujuan ini?',
    options: [
      'Ya, dengan metrik spesifik (mis. mengurangi biaya sebesar 20%)',
      'Ya, tetapi belum terukur (mis. meningkatkan efisiensi)',
      'Belum, masih dalam tahap eksplorasi',
    ],
  },
  target_metrics: {
    question: 'Jika ya, apa target metrik Anda?',
    placeholder: 'mis. Mengurangi waktu proses sebesar 30%, Meningkatkan akurasi menjadi 95%',
    helperText: 'Kosongkan jika tidak berlaku',
  },
  kpi_tracking: {
    question: 'Bagaimana Anda saat ini melacak KPI tersebut?',
    options: [
      'Dasbor otomatis',
      'Laporan manual',
      'Spreadsheet',
      'Belum dilacak saat ini',
      'Lainnya',
    ],
  },
  kpi_baseline: {
    question: 'Berapa nilai dasar (baseline) saat ini untuk KPI operasional Anda yang paling penting?',
    placeholder: 'mis. Waktu siklus pesanan ~3 hari; tingkat kesalahan ~4%; ~1.200 faktur/bulan',
    helperText: 'Opsional — memungkinkan laporan mengacu pada angka nyata Anda saat menilai peningkatan (tidak dinilai)',
  },
  success_timeline: {
    question: 'Berapa perkiraan jangka waktu Anda untuk mencapai tujuan ini?',
    options: [
      '1-3 bulan',
      '3-6 bulan',
      '6-12 bulan',
      '12+ bulan',
      'Fleksibel/Berkelanjutan',
    ],
  },

  // --- Phase 2: data_process_readiness ---
  data_centralization: {
    question: 'Seberapa terpusat data Anda?',
    options: [
      'Sepenuhnya terpusat dalam data warehouse/lake',
      'Sebagian terpusat di beberapa sistem',
      'Tersebar terpisah (silo) antar-departemen',
      'Tidak ada pemusatan sama sekali',
    ],
  },
  data_quality: {
    question: 'Bagaimana Anda menilai kualitas data Anda?',
    options: [
      'Kualitas tinggi, bersih, dan konsisten',
      'Kualitas baik dengan sedikit masalah',
      'Kualitas sedang, perlu dibersihkan',
      'Kualitas buruk, banyak masalah',
    ],
  },
  process_documentation: {
    question: 'Berapa persen proses utama Anda yang sudah terdokumentasi?',
  },
  workflow_standardization: {
    question: 'Seberapa terstandardisasi alur kerja Anda?',
    options: [
      'Sepenuhnya terstandardisasi dengan prosedur yang jelas',
      'Sebagian besar terstandardisasi dengan sedikit variasi',
      'Ada sedikit standardisasi, sebagian besar ad-hoc',
      'Sepenuhnya ad-hoc',
    ],
  },
  process_ownership: {
    question: 'Siapa yang bertanggung jawab atas proses inti Anda sehari-hari?',
    helperText: 'Opsional — ketergantungan pada individu tertentu adalah sinyal risiko operasional utama (tidak dinilai)',
    options: [
      'Pemilik jelas dengan akuntabilitas terdokumentasi',
      'Ada pemilik, tetapi akuntabilitasnya informal',
      'Proses utama bergantung pada satu atau dua orang tertentu',
      'Tidak ada kepemilikan yang jelas',
    ],
  },
  system_integration: {
    question: 'Bagaimana tingkat integrasi sistem Anda saat ini?',
    options: [
      'Terintegrasi penuh dengan API dan otomasi',
      'Ada integrasi antar beberapa sistem utama',
      'Sistem terpisah dengan transfer data manual',
      'Tidak ada integrasi',
    ],
  },
  automation_current: {
    question: 'Berapa persen proses Anda yang saat ini sudah terotomasi?',
  },
  manual_hours_weekly: {
    question: 'Kira-kira berapa jam manual per minggu yang dihabiskan tim Anda untuk tugas berulang?',
    helperText: 'Mencakup semua anggota tim yang relevan — digunakan untuk menghitung proyeksi ROI',
    options: [
      'Di bawah 10 jam/minggu',
      '10-25 jam/minggu',
      '25-50 jam/minggu',
      '50-100 jam/minggu',
      'Di atas 100 jam/minggu',
      'Tidak yakin',
    ],
  },
  fte_count: {
    question: 'Berapa jumlah karyawan penuh waktu (FTE) yang termasuk dalam cakupan otomasi?',
    helperText: 'Digunakan untuk mengkalibrasi estimasi ROI dan penghematan',
    options: [
      '1-5 FTE',
      '6-15 FTE',
      '16-50 FTE',
      '51-200 FTE',
      'Di atas 200 FTE',
      'Tidak yakin',
    ],
  },
  estimate_basis: {
    question: 'Bagaimana estimasi waktu dan beban kerja di atas diperoleh?',
    helperText: 'Pelacakan yang lebih ketat meningkatkan tingkat keyakinan pada proyeksi keuangan Anda.',
    options: [
      'Perkiraan kasar / intuisi',
      'Pelacakan informal (catatan, spreadsheet)',
      'Sistem pelacakan waktu formal',
    ],
  },
  data_infrastructure: {
    question: 'Mana yang paling menggambarkan infrastruktur data Anda saat ini?',
    helperText: 'Platform data dengan kematangan lebih tinggi mempercepat waktu realisasi nilai dari otomasi',
    options: [
      'Spreadsheet / berkas manual',
      'Basis data (SQL / NoSQL)',
      'Data warehouse atau data lake',
      'Platform data modern (streaming, katalog, tata kelola)',
    ],
  },

  // --- Phase 3: risk_constraints ---
  budget_allocated: {
    question: 'Apakah Anda memiliki anggaran khusus untuk peningkatan operasional dan otomasi?',
    options: [
      'Ya, dengan alokasi khusus',
      'Ya, tetapi fleksibel/masih eksploratif',
      'Belum, tetapi sedang menjajaki opsi',
      'Belum ada anggaran saat ini',
    ],
  },
  budget_range: {
    question: 'Jika ya, berapa kisaran anggaran Anda?',
    options: [
      'Di bawah $10K',
      '$10K - $50K',
      '$50K - $100K',
      '$100K - $500K',
      'Di atas $500K',
      'Tidak berlaku',
    ],
  },
  leadership_alignment: {
    question: 'Seberapa selaras pimpinan Anda terhadap transformasi operasional?',
    options: [
      'Sepenuhnya selaras dan menjadi penggerak utama',
      'Mendukung tetapi berhati-hati',
      'Ada ketertarikan, tetapi masih perlu diyakinkan',
      'Tidak ada keselarasan atau ketertarikan',
    ],
  },
  change_readiness: {
    question: 'Seberapa siap organisasi Anda menghadapi perubahan?',
    options: [
      'Menyambut perubahan secara aktif',
      'Terbuka terhadap perubahan dengan perencanaan yang tepat',
      'Berhati-hati terhadap perubahan',
      'Menolak perubahan',
    ],
  },
  compliance_requirements: {
    question: 'Apakah Anda memiliki persyaratan kepatuhan atau regulasi tertentu?',
    helperText: 'Pilih semua yang berlaku',
    options: [
      'GDPR',
      'HIPAA',
      'SOC 2',
      'ISO 27001',
      'Regulasi khusus industri',
      'Tidak ada',
      'Lainnya',
    ],
  },
  risk_tolerance: {
    question: 'Bagaimana toleransi risiko organisasi Anda terhadap perubahan operasional dan otomasi?',
    options: [
      'Tinggi - bersedia bereksperimen dan melakukan iterasi',
      'Sedang - pendekatan yang seimbang',
      'Rendah - lebih memilih solusi yang telah terbukti',
      'Sangat rendah - sangat berhati-hati',
    ],
  },
  target_automation: {
    question: 'Berapa target tingkat otomasi Anda dalam 12 bulan ke depan?',
    helperText: 'Digunakan untuk menghitung proyeksi ROI dan penghematan',
  },
  data_residency: {
    question: 'Apakah Anda memiliki persyaratan residensi data atau kedaulatan data?',
    helperText: 'Memengaruhi pilihan infrastruktur AI yang tersedia',
    options: [
      'Ya — data harus tetap berada di dalam negeri',
      'Ya — memerlukan wilayah cloud tertentu',
      'Tidak ada persyaratan khusus',
      'Tidak yakin',
    ],
  },
  ai_governance: {
    question: 'Apakah Anda memiliki tata kelola AI atau proses pengawasan?',
    helperText: 'Tata kelola adalah faktor penentu utama dalam adopsi AI tingkat perusahaan',
    options: [
      'Belum ada tata kelola AI',
      'Pengawasan informal / ad-hoc',
      'Tata kelola & pengawasan AI formal',
    ],
  },
  ai_data_privacy: {
    question: 'Bagaimana Anda menangani privasi & keamanan data untuk sistem AI?',
    helperText: 'Kontrol privasi menentukan data mana yang dapat digunakan untuk AI',
    options: [
      'Belum ada kebijakan privasi data formal',
      'Kebijakan privasi dasar',
      'Kebijakan privasi formal dengan kontrol (DPIA, kontrol akses, audit)',
    ],
  },

  // --- Phase 4: ai_opportunity_mapping ---
  pain_points: {
    question: 'Apa 3 kendala operasional terbesar Anda?',
    placeholder: 'Sebutkan tantangan terbesar Anda (satu per baris)',
    helperText: 'Jelaskan secara spesifik apa yang menyebabkan keterlambatan, kesalahan, atau inefisiensi',
  },
  manual_processes: {
    question: 'Proses mana yang paling banyak memakan usaha manual?',
    placeholder: 'Jelaskan tugas manual yang memakan banyak waktu',
    helperText: 'Sertakan perkiraan waktu yang dihabiskan per minggu jika diketahui',
  },
  pain_point_hours: {
    question: 'Kira-kira berapa jam per minggu dihabiskan untuk masing-masing kendala di atas?',
    placeholder: 'mis. Input faktur ~10 jam/minggu; mengejar persetujuan ~5 jam/minggu',
    helperText: 'Opsional — mempertajam estimasi biaya hambatan dalam laporan Anda (tidak dinilai)',
  },
  decision_speed: {
    question: 'Seberapa cepat organisasi Anda dapat mengambil keputusan atas inisiatif baru?',
    options: [
      'Hitungan jam hingga hari',
      'Hitungan hari hingga minggu',
      'Hitungan minggu hingga bulan',
      'Hitungan bulan atau lebih lama',
    ],
  },
  internal_capability: {
    question: 'Bagaimana kapabilitas teknis internal Anda untuk otomasi dan AI?',
    options: [
      'Tim AI yang kuat dan berpengalaman',
      'Punya sedikit pengetahuan AI, masih perlu bimbingan',
      'Kemampuan teknis terbatas',
      'Tidak ada tim teknis',
    ],
  },
  preferred_approach: {
    question: 'Apa pendekatan yang Anda pilih untuk menerapkan peningkatan ini?',
    options: [
      'Membangun secara internal dengan tim sendiri',
      'Bermitra dengan ahli eksternal',
      'Pendekatan hybrid (internal + eksternal)',
      'Belum yakin',
    ],
  },
  priority_areas: {
    question: 'Area mana yang menjadi prioritas tertinggi untuk peningkatan operasional?',
    helperText: 'Pilih semua yang berlaku',
    options: [
      'Layanan/dukungan pelanggan',
      'Penjualan dan pemasaran',
      'Operasional dan logistik',
      'Keuangan dan akuntansi',
      'SDM dan rekrutmen',
      'Pengembangan produk',
      'Analisis dan pelaporan data',
      'Lainnya',
    ],
  },
  prior_ai_attempts: {
    question: 'Apakah Anda pernah mencoba menerapkan AI atau otomasi sebelumnya?',
    helperText: 'Pengalaman sebelumnya membantu mengkalibrasi risiko implementasi',
    options: [
      'Ya — berhasil, masih digunakan saat ini',
      'Ya — sebagian berhasil, beberapa masih berjalan',
      'Ya — tidak berhasil atau dihentikan',
      'Belum — ini adalah percobaan pertama kami',
      'Sedang dalam tahap uji coba/evaluasi',
    ],
  },
  delay_consequence: {
    question: 'Apa konsekuensi jika peningkatan operasional ini ditunda selama 6-12 bulan?',
    options: [
      'Kerugian kompetitif yang signifikan',
      'Inefisiensi dan biaya operasional yang terus berlanjut',
      'Kehilangan peluang pendapatan atau pertumbuhan',
      'Dampak minimal — waktu bersifat fleksibel',
      'Tidak yakin',
    ],
  },
}
