/**
 * Ported verbatim from Aivory-hub88/Frntend-nxt src/lib/assessmentCopy.ts
 * (removed from the landing page in Frntend-nxt#155). Only the Locale type
 * import changed. Keep wording identical to the public free analysis.
 */
type Language = 'en' | 'id';

/**
 * Every user-visible string in the free Business Operations Analysis, in
 * English and Indonesian.
 *
 * It lives outside page.tsx because the analysis carries roughly 180 strings
 * — twelve questions with four options each, twenty-four insight lines, five
 * band narratives — and interleaving two languages with the scoring engine
 * would bury the logic.
 *
 * Two rules hold this together:
 *
 * 1. **Identifiers never translate.** Question ids, dimension keys and the
 *    maturity band names are load-bearing: they are JSONB keys in
 *    `assessment_leads.answers`, they are compared against the paid product's
 *    `maturityFromScore`, and they are stored in `assessment_leads.maturity`.
 *    Only their *labels* appear here. A lead answered in Indonesian and one
 *    answered in English must remain the same row shape.
 *
 * 2. **English is British.** `organisation`, `standardised`, `prioritised`.
 */

export type Locale = Language;

export interface BandCopy {
  /** Display name. The canonical English name is what gets stored. */
  name: string;
  /** One line that makes the band mean something rather than just rank. */
  descriptor: string;
}

export interface AssessmentStrings {
  questions: Record<string, { question: string; options: string[] }>;
  /** Per-question label used on the cards and as the traceability driver. */
  questionLabels: Record<string, string>;
  /** The five aggregated dimensions. */
  dimensions: Record<string, string>;
  /** Keyed by the same value the <select> stores, so the option value never moves. */
  industries: Record<string, string>;
  sizes: Record<string, string>;
  insights: Record<string, { strength: string; blocker: string }>;
  bands: Record<string, BandCopy>;
  narrative: Record<string, (company: string, score: number) => string>;
  ui: {
    profileTitle: string;
    profileSubtitle: string;
    companyName: string;
    companySize: string;
    industry: string;
    selectIndustry: string;
    selectSize: string;
    companyPlaceholder: string;
    continue: string;
    back: string;
    next: string;
    seeResults: string;
    questionOf: (n: number, total: number) => string;
    resultsTitle: string;
    resultsSubhead: (score: number, maturity: string) => string;
    emailGateLabel: string;
    emailPlaceholder: string;
    emailCta: string;
    emailNote: string;
    emailInvalid: string;
    sharePng: string;
    renderingPng: string;
    pdfDownloaded: string;
    deliverySending: (email: string) => string;
    deliverySent: (email: string) => string;
    deliveryFailed: string;
    emailUndeliverable: string;
    emailDidYouMean: (suggestion: string) => string;
    emailUseSuggestion: string;
    languageLabel: string;
  };
  card: {
    quickAssessment: string;
    ofBusinessOperations: string;
    companyName: string;
    industryCategory: string;
    industrySize: string;
    score: string;
    operationalProfile: string;
    workingForYou: string;
    holdingYouBack: string;
    strength: string;
    blocker: string;
    notes: string;
    rights: string;
    /** Soft prioritisation — names the order without prescribing a fix. */
    biggestConstraint: (top: string, topScore: number, rest: string[]) => string;
    allStrong: string;
    /** Generic direction. Deliberately not a method or a plan. */
    nextStep: (dimension: string) => string;
    quickNoteTitle: (score: number, maturity: string) => string;
    strongestDimension: (label: string, score: number) => string;
    needsImprovement: (list: string) => string;
  };
  hook: {
    findingOne: string;
    findingMany: (countWord: string) => string;
    findingNone: string;
    declineOne: string;
    declineMany: string;
    declineNone: string;
    countWords: string[];
  };
  pdf: {
    generated: string;
    ref: string;
    page: string;
    ctaButton: string;
    docTitle: (company: string) => string;
    docSubject: (score: number, maturity: string) => string;
  };
}

// ── Shared identifiers, never translated ─────────────────────────────────────
export const QUESTION_IDS = [
  'process_documentation', 'workflow_standardization', 'data_availability',
  'systems_integration', 'manual_workload', 'rework_rate', 'handoff_delay',
  'decision_latency', 'ownership_clarity', 'improvement_mandate',
  'change_readiness', 'internal_capability',
] as const;

const EN: AssessmentStrings = {
  questions: {
    process_documentation: { question: 'How are your core processes captured today?', options: ['Nothing written down', "In people's heads, informally", 'Some SOPs, partly current', 'Documented and kept current'] },
    workflow_standardization: { question: 'If two people do the same task, how similar is the result?', options: ['Completely different', 'Broadly similar', 'Mostly consistent', 'Identical, by design'] },
    data_availability: { question: 'Where does the data you run the business on live?', options: ['Nowhere central', 'Scattered across tools and spreadsheets', 'Partly consolidated', 'One system of record'] },
    systems_integration: { question: 'Do your core systems pass information to each other?', options: ['No real systems yet', 'People move data by hand', 'Some connected, some manual', 'Connected end to end'] },
    manual_workload: { question: "How much of your team's week goes to repetitive manual work?", options: ['Most of it', 'About half', 'Some, but contained', 'Very little'] },
    rework_rate: { question: 'How often does completed work have to be corrected or redone?', options: ['Constantly', 'Weekly', 'Occasionally', 'Rarely'] },
    handoff_delay: { question: 'When work passes between teams or systems, what happens?', options: ['It stalls, often for days', 'It waits, then someone chases', 'Minor delays', 'It moves without waiting'] },
    decision_latency: { question: 'From "we need to decide this" to an actual decision, how long?', options: ['Months', 'Weeks', 'Days', 'Same day'] },
    ownership_clarity: { question: 'Does each core workflow have a named owner?', options: ['No one owns them', 'Ownership is implied, not stated', 'Most have an owner', 'Every one, and they are accountable'] },
    improvement_mandate: { question: 'Is there budget and a mandate to change how work gets done?', options: ['Neither', 'Interest, but nothing committed', 'Budget being discussed', 'Funded, with an owner'] },
    change_readiness: { question: 'How does the organisation react to changing how work is done?', options: ['Resists it', 'Cautious', 'Open to it', 'Actively pushes for it'] },
    internal_capability: { question: 'Do you have people who can implement operational change?', options: ['No one', 'Limited digital skills', 'Some capable people', 'A dedicated team'] },
  },
  questionLabels: {
    process_documentation: 'Process Documentation', workflow_standardization: 'Workflow Consistency',
    data_availability: 'Data Availability', systems_integration: 'Systems Integration',
    manual_workload: 'Manual Workload', rework_rate: 'Rework Rate',
    handoff_delay: 'Handoff Flow', decision_latency: 'Decision Speed',
    ownership_clarity: 'Ownership Clarity', improvement_mandate: 'Improvement Mandate',
    change_readiness: 'Change Readiness', internal_capability: 'Internal Capability',
  },
  dimensions: { process: 'Process', data: 'Data', strategy: 'Strategy', governance: 'Governance', people: 'People' },
  industries: {
    manufacturing: 'Manufacturing', retail: 'Retail & e-commerce', financial: 'Financial services',
    healthcare: 'Healthcare', logistics: 'Logistics & supply chain', professional: 'Professional services',
    property: 'Property & construction', technology: 'Technology', education: 'Education',
    marketing: 'Marketing', advertising: 'Advertising', food_beverage: 'Food & beverage', other: 'Other',
  },
  sizes: {
    micro: '1–10 (Micro)', small: '11–50 (Small)', medium: '51–200 (Medium)',
    large: '201–1000 (Large)', enterprise: '1000+ (Enterprise)',
  },
  insights: {
    process_documentation: {
      strength: 'Written, current processes make operations repeatable — new people get productive faster, and improvements stick instead of decaying back.',
      blocker: 'Undocumented processes live in individual heads, so operations stay person-dependent and every absence or departure becomes an outage.',
    },
    workflow_standardization: {
      strength: 'The same task produces the same result whoever runs it, so quality is predictable and capacity can be added without diluting output.',
      blocker: 'The same task produces a different result depending on who does it, so quality stays unpredictable and no fix can be rolled out reliably.',
    },
    data_availability: {
      strength: 'One system of record means everyone argues from the same numbers, and decisions stop waiting on someone to reconcile spreadsheets.',
      blocker: 'Data scattered across tools and spreadsheets means nobody sees the whole picture, and every decision starts by rebuilding the same view by hand.',
    },
    systems_integration: {
      strength: 'Systems that pass information to each other remove an entire class of manual re-entry, along with the errors and delay it introduces.',
      blocker: 'Moving data between systems by hand costs hours nobody tracks, and introduces errors that surface downstream after they have already cost something.',
    },
    manual_workload: {
      strength: "Little of the week goes to repetitive work, so the team's hours are spent on judgement rather than keystrokes.",
      blocker: 'Repetitive work consumes most of the week, so capacity goes to maintaining the business rather than improving it.',
    },
    rework_rate: {
      strength: 'Work is rarely redone, which means problems are caught where they start rather than after the cost is already sunk.',
      blocker: 'Frequent rework is the clearest sign quality is inspected in at the end rather than built in, and every correction is paid for twice.',
    },
    handoff_delay: {
      strength: 'Work moves between teams without waiting, so elapsed time reflects the actual work rather than the queue between the steps.',
      blocker: 'Work stalls every time it changes hands, so most of the elapsed time on a task is spent waiting rather than being worked on.',
    },
    decision_latency: {
      strength: 'Decisions land in days, so improvements start paying back while the reason for them is still current.',
      blocker: 'Decisions that take weeks or months mean improvements are stale by the time they are approved, and the cost of waiting never appears on any report.',
    },
    ownership_clarity: {
      strength: 'Every core workflow has a named, accountable owner — which is what makes an improvement hold after the attention moves elsewhere.',
      blocker: 'Workflows with no named owner have nobody to notice when they drift, so problems only escalate once a customer feels them.',
    },
    improvement_mandate: {
      strength: 'Funded change with a named owner means an identified improvement can actually be executed rather than added to a list.',
      blocker: 'Without committed budget and a clear mandate, identified improvements stay identified — the diagnosis costs nothing, the delay does.',
    },
    change_readiness: {
      strength: 'An organisation that pushes for better ways of working adopts change under its own momentum instead of having to be driven through it.',
      blocker: 'Resistance to changing how work is done means even well-designed improvements are quietly abandoned once the rollout attention ends.',
    },
    internal_capability: {
      strength: 'Having people who can implement operational change means improvements get built and maintained in-house rather than rented indefinitely.',
      blocker: 'With nobody able to implement change, every improvement depends on an outside vendor, which caps both the pace and the depth of what is possible.',
    },
  },
  bands: {
    Nascent: { name: 'Nascent', descriptor: 'The building blocks are not in place yet — work depends on individuals rather than systems.' },
    Initiating: { name: 'Initiating', descriptor: 'Foundations are forming, but results still rest more on individual effort than on repeatable process.' },
    Developing: { name: 'Developing', descriptor: 'Foundations exist, but execution is still inconsistent across the business.' },
    Defined: { name: 'Defined', descriptor: 'Processes are documented and followed consistently enough to scale on.' },
    Optimising: { name: 'Optimising', descriptor: 'Operations are measured and instrumented, and improvement compounds.' },
  },
  narrative: {
    Nascent: (c, s) => `For ${c}, a score of ${s}/100 points to an early stage of operational maturity. That is a valid starting point — many well-run organisations began here. The groundwork comes first: pick one core workflow, write down how it actually runs today, and make it consistent before changing anything else.`,
    Initiating: (c, s) => `For ${c}, a score of ${s}/100 shows the foundation beginning to take shape while critical gaps remain. Organisations at this stage gain most from one narrow, visible win — a single handoff or a single source of rework, fixed where the result can be measured within 30–90 days.`,
    Developing: (c, s) => `For ${c}, a score of ${s}/100 indicates solid ground — core processes are defined and several foundations are in place. This is the moment to move from isolated fixes to a structured improvement plan with targets attached to it.`,
    Defined: (c, s) => `For ${c}, a score of ${s}/100 reflects advanced operational maturity — work is standardised, owned, and measured. The next step is scaling what already works into the areas it has not reached yet, and tightening how outcomes are tracked.`,
    Optimising: (c, s) => `For ${c}, a score of ${s}/100 places you among organisations whose operations are genuinely well-run. At this level the remaining gains compound: shortening the distance between deciding and acting, and removing the last places where work still waits on a person.`,
  },
  ui: {
    profileTitle: "Let's start with your company",
    profileSubtitle: 'This helps us tailor the analysis to your context.',
    companyName: 'Company name', companySize: 'Company size', industry: 'Industry',
    selectIndustry: 'Select industry...', selectSize: 'Select company size...',
    companyPlaceholder: 'e.g. PT Maju Bersama',
    continue: 'Continue', back: '← Back to profile', next: 'Next', seeResults: 'See results',
    questionOf: (n, total) => `Question ${n} of ${total}`,
    resultsTitle: 'Your Business Operations Analysis Report',
    resultsSubhead: (score, maturity) => `Score ${score}/100 · ${maturity} maturity — your full breakdown is below.`,
    emailGateLabel: 'Where should we send a copy of this report?',
    emailPlaceholder: 'you@company.com',
    emailCta: 'Get my report',
    emailNote: 'Unlocks the downloadable report below. No spam — we use this to send your report and nothing else.',
    emailInvalid: 'Enter a valid email address.',
    sharePng: 'Share as image (PNG)', renderingPng: 'Rendering images…',
    pdfDownloaded: 'Your PDF report has downloaded — check your downloads folder.',
    deliverySending: e => `Emailing a copy to ${e}…`,
    deliverySent: e => `A copy is on its way to ${e}.`,
    deliveryFailed: 'We could not email a copy just now — your download above has the full report.',
    emailUndeliverable: 'That domain cannot receive email — please check the address.',
    emailDidYouMean: s => `Did you mean ${s}?`,
    emailUseSuggestion: 'Use this',
    languageLabel: 'Language',
  },
  card: {
    quickAssessment: 'Quick Analysis', ofBusinessOperations: 'of Business Operations',
    companyName: 'Company name', industryCategory: 'Industry category', industrySize: 'Company size',
    score: 'Score', operationalProfile: 'Operational profile',
    workingForYou: 'Working for you', holdingYouBack: 'Holding you back',
    strength: 'Strength', blocker: 'Blocker', notes: 'Notes',
    rights: '© 2026 Aivory. All rights reserved.',
    biggestConstraint: (top, topScore, rest) =>
      rest.length
        ? `Your biggest constraint right now appears to be ${top} (${topScore}/100), followed by ${rest.join(' and ')}.`
        : `Your biggest constraint right now appears to be ${top} (${topScore}/100).`,
    allStrong: 'No dimension is holding you back — all five are scoring above the level where automation holds up.',
    nextStep: d => `The most valuable next step is usually a structured review of how ${d.toLowerCase()} is owned and documented.`,
    quickNoteTitle: (score, maturity) => `Quick note: ${score}/100 — ${maturity}`,
    strongestDimension: (label, score) => `Strongest dimension: ${label} (${score}/100).`,
    needsImprovement: list => `Needs improvement: ${list}.`,
  },
  hook: {
    findingOne: 'One part of your operation is running below the level where automation holds up. This analysis shows where it is.',
    findingMany: w => `${w} parts of your operation are running below the level where automation holds up. This analysis shows where they are.`,
    findingNone: 'Every dimension of your operation is running at or above the level where automation holds up — an unusual result, and a strong base to build on.',
    declineOne: 'What it does not show is what fixing it is worth, which one to start with, or where AI can carry the load. That is the Business Operations Analysis.',
    declineMany: 'What it does not show is what fixing them is worth, which one to start with, or where AI can carry the load. That is the Business Operations Analysis.',
    declineNone: 'What this analysis does not show is which of them repays attention first, what that is worth in recovered time and cost, or where AI can carry the load. That is the Business Operations Analysis.',
    countWords: ['No', 'One', 'Two', 'Three', 'Four', 'Five'],
  },
  pdf: {
    generated: 'Generated', ref: 'Ref', page: 'Page 1 of 1',
    ctaButton: 'See the Business Operations Analysis',
    docTitle: c => `Business Operations Analysis — ${c}`,
    docSubject: (score, maturity) => `Operational maturity ${score}/100 (${maturity})`,
  },
};

const ID: AssessmentStrings = {
  questions: {
    process_documentation: { question: 'Bagaimana proses inti Anda didokumentasikan saat ini?', options: ['Tidak ada yang tertulis', 'Ada di kepala orang, informal', 'Ada sebagian SOP, tidak semuanya terkini', 'Terdokumentasi dan selalu diperbarui'] },
    workflow_standardization: { question: 'Jika dua orang mengerjakan tugas yang sama, seberapa mirip hasilnya?', options: ['Sama sekali berbeda', 'Mirip secara garis besar', 'Sebagian besar konsisten', 'Identik, memang dirancang begitu'] },
    data_availability: { question: 'Di mana data yang Anda pakai menjalankan bisnis disimpan?', options: ['Tidak ada yang terpusat', 'Tersebar di berbagai alat dan spreadsheet', 'Sebagian sudah terkonsolidasi', 'Satu sistem pencatatan tunggal'] },
    systems_integration: { question: 'Apakah sistem inti Anda saling bertukar informasi?', options: ['Belum ada sistem sungguhan', 'Orang memindahkan data secara manual', 'Sebagian terhubung, sebagian manual', 'Terhubung dari ujung ke ujung'] },
    manual_workload: { question: 'Berapa banyak waktu tim Anda dalam seminggu habis untuk pekerjaan manual berulang?', options: ['Sebagian besar', 'Sekitar separuh', 'Ada, tapi terkendali', 'Sangat sedikit'] },
    rework_rate: { question: 'Seberapa sering pekerjaan yang sudah selesai harus dikoreksi atau diulang?', options: ['Terus-menerus', 'Mingguan', 'Sesekali', 'Jarang'] },
    handoff_delay: { question: 'Saat pekerjaan berpindah antar tim atau sistem, apa yang terjadi?', options: ['Mandek, sering sampai berhari-hari', 'Menunggu, lalu ada yang harus mengejar', 'Sedikit tertunda', 'Berjalan tanpa menunggu'] },
    decision_latency: { question: 'Dari "ini perlu diputuskan" sampai keputusan benar-benar diambil, berapa lama?', options: ['Berbulan-bulan', 'Berminggu-minggu', 'Beberapa hari', 'Hari yang sama'] },
    ownership_clarity: { question: 'Apakah setiap alur kerja inti punya penanggung jawab yang jelas?', options: ['Tidak ada yang bertanggung jawab', 'Tersirat, tapi tidak pernah ditetapkan', 'Sebagian besar ada penanggung jawabnya', 'Semuanya ada, dan mereka akuntabel'] },
    improvement_mandate: { question: 'Apakah ada anggaran dan mandat untuk mengubah cara kerja?', options: ['Tidak keduanya', 'Ada minat, tapi belum ada komitmen', 'Anggaran sedang dibahas', 'Sudah didanai, dengan penanggung jawab'] },
    change_readiness: { question: 'Bagaimana organisasi bereaksi terhadap perubahan cara kerja?', options: ['Menolak', 'Berhati-hati', 'Terbuka', 'Aktif mendorongnya'] },
    internal_capability: { question: 'Apakah Anda punya orang yang mampu menjalankan perubahan operasional?', options: ['Tidak ada', 'Kemampuan digital terbatas', 'Ada beberapa yang mampu', 'Ada tim khusus'] },
  },
  questionLabels: {
    process_documentation: 'Dokumentasi Proses', workflow_standardization: 'Konsistensi Alur Kerja',
    data_availability: 'Ketersediaan Data', systems_integration: 'Integrasi Sistem',
    manual_workload: 'Beban Kerja Manual', rework_rate: 'Tingkat Pengulangan',
    handoff_delay: 'Kelancaran Serah Terima', decision_latency: 'Kecepatan Keputusan',
    ownership_clarity: 'Kejelasan Kepemilikan', improvement_mandate: 'Mandat Perbaikan',
    change_readiness: 'Kesiapan Berubah', internal_capability: 'Kapabilitas Internal',
  },
  dimensions: { process: 'Proses', data: 'Data', strategy: 'Strategi', governance: 'Tata Kelola', people: 'Sumber Daya Manusia' },
  industries: {
    manufacturing: 'Manufaktur', retail: 'Ritel & e-commerce', financial: 'Jasa keuangan',
    healthcare: 'Kesehatan', logistics: 'Logistik & rantai pasok', professional: 'Jasa profesional',
    property: 'Properti & konstruksi', technology: 'Teknologi', education: 'Pendidikan',
    marketing: 'Pemasaran', advertising: 'Periklanan', food_beverage: 'Makanan & minuman', other: 'Lainnya',
  },
  sizes: {
    micro: '1–10 (Mikro)', small: '11–50 (Kecil)', medium: '51–200 (Menengah)',
    large: '201–1000 (Besar)', enterprise: '1000+ (Korporasi)',
  },
  insights: {
    process_documentation: {
      strength: 'Proses yang tertulis dan terkini membuat kerja operasional bisa diulang — orang baru lebih cepat produktif, dan perbaikan bertahan alih-alih kembali seperti semula.',
      blocker: 'Proses yang tidak terdokumentasi hidup di kepala masing-masing orang, sehingga jalannya operasional bergantung pada individu dan setiap ketidakhadiran menjadi gangguan.',
    },
    workflow_standardization: {
      strength: 'Tugas yang sama menghasilkan keluaran yang sama siapa pun yang mengerjakan, sehingga mutu bisa diprediksi dan kapasitas bisa ditambah tanpa menurunkan hasil.',
      blocker: 'Tugas yang sama memberi hasil berbeda tergantung siapa yang mengerjakan, sehingga mutu tidak terprediksi dan tidak ada perbaikan yang bisa diterapkan secara andal.',
    },
    data_availability: {
      strength: 'Satu sistem pencatatan berarti semua orang berdebat dari angka yang sama, dan keputusan tidak lagi menunggu seseorang merekonsiliasi spreadsheet.',
      blocker: 'Data yang tersebar di berbagai alat dan spreadsheet membuat tidak ada yang melihat gambaran utuh, dan setiap keputusan dimulai dengan menyusun ulang tampilan yang sama secara manual.',
    },
    systems_integration: {
      strength: 'Sistem yang saling bertukar informasi menghapus satu kelas pekerjaan input ulang manual, beserta kesalahan dan keterlambatan yang menyertainya.',
      blocker: 'Memindahkan data antar sistem secara manual memakan jam kerja yang tidak pernah dihitung, dan menimbulkan kesalahan yang baru ketahuan di hilir setelah terlanjur merugikan.',
    },
    manual_workload: {
      strength: 'Sedikit waktu dalam seminggu habis untuk pekerjaan berulang, sehingga jam kerja tim dipakai untuk pertimbangan, bukan mengetik ulang.',
      blocker: 'Pekerjaan berulang menghabiskan sebagian besar minggu, sehingga kapasitas terpakai untuk mempertahankan bisnis alih-alih memperbaikinya.',
    },
    rework_rate: {
      strength: 'Pekerjaan jarang harus diulang, artinya masalah tertangkap di tempat asalnya, bukan setelah biayanya terlanjur keluar.',
      blocker: 'Pengulangan yang sering adalah tanda paling jelas bahwa mutu diperiksa di akhir alih-alih dibangun sejak awal, dan setiap koreksi dibayar dua kali.',
    },
    handoff_delay: {
      strength: 'Pekerjaan berpindah antar tim tanpa menunggu, sehingga waktu yang berlalu mencerminkan pekerjaan sesungguhnya, bukan antrean di antara langkah.',
      blocker: 'Pekerjaan mandek setiap kali berpindah tangan, sehingga sebagian besar waktu sebuah tugas habis untuk menunggu, bukan untuk dikerjakan.',
    },
    decision_latency: {
      strength: 'Keputusan diambil dalam hitungan hari, sehingga perbaikan mulai memberi hasil selagi alasannya masih relevan.',
      blocker: 'Keputusan yang makan waktu berminggu-minggu membuat perbaikan sudah basi saat disetujui, dan biaya menunggunya tidak pernah muncul di laporan mana pun.',
    },
    ownership_clarity: {
      strength: 'Setiap alur kerja inti punya penanggung jawab yang jelas dan akuntabel — itulah yang membuat sebuah perbaikan bertahan setelah perhatian beralih.',
      blocker: 'Alur kerja tanpa penanggung jawab tidak punya siapa pun yang menyadari saat ia melenceng, sehingga masalah baru naik ke permukaan setelah pelanggan merasakannya.',
    },
    improvement_mandate: {
      strength: 'Perubahan yang didanai dengan penanggung jawab yang jelas berarti perbaikan yang teridentifikasi benar-benar bisa dijalankan, bukan sekadar masuk daftar.',
      blocker: 'Tanpa anggaran dan mandat yang jelas, perbaikan yang teridentifikasi berhenti sebagai identifikasi — diagnosisnya gratis, penundaannya tidak.',
    },
    change_readiness: {
      strength: 'Organisasi yang mendorong cara kerja lebih baik mengadopsi perubahan atas momentumnya sendiri, tanpa harus dipaksa dari atas.',
      blocker: 'Penolakan terhadap perubahan cara kerja membuat perbaikan yang dirancang baik pun diam-diam ditinggalkan begitu perhatian peluncurannya berakhir.',
    },
    internal_capability: {
      strength: 'Punya orang yang mampu menjalankan perubahan operasional berarti perbaikan dibangun dan dirawat sendiri, bukan disewa terus-menerus.',
      blocker: 'Tanpa orang yang mampu menjalankan perubahan, setiap perbaikan bergantung pada vendor luar, dan itu membatasi kecepatan sekaligus kedalaman yang mungkin dicapai.',
    },
  },
  bands: {
    Nascent: { name: 'Nascent', descriptor: 'Fondasinya belum terpasang — pekerjaan masih bergantung pada individu, bukan sistem.' },
    Initiating: { name: 'Initiating', descriptor: 'Fondasi mulai terbentuk, tapi hasil masih lebih bergantung pada usaha individu daripada proses yang berulang.' },
    Developing: { name: 'Developing', descriptor: 'Fondasinya ada, tapi pelaksanaannya masih belum konsisten di seluruh bisnis.' },
    Defined: { name: 'Defined', descriptor: 'Proses terdokumentasi dan dijalankan cukup konsisten untuk dijadikan pijakan bertumbuh.' },
    Optimising: { name: 'Optimising', descriptor: 'Operasi terukur dan terpantau, dan perbaikannya berlipat ganda.' },
  },
  narrative: {
    Nascent: (c, s) => `Untuk ${c}, skor ${s}/100 menunjukkan tahap awal kematangan operasional. Itu titik mulai yang sah — banyak organisasi yang kini rapi juga berangkat dari sini. Pekerjaan dasarnya lebih dulu: pilih satu alur kerja inti, tuliskan bagaimana ia benar-benar berjalan hari ini, dan buat konsisten sebelum mengubah apa pun yang lain.`,
    Initiating: (c, s) => `Untuk ${c}, skor ${s}/100 memperlihatkan fondasi yang mulai terbentuk sementara celah penting masih ada. Organisasi di tahap ini paling diuntungkan oleh satu kemenangan sempit yang terlihat — satu serah terima atau satu sumber pengulangan, diperbaiki di titik yang hasilnya bisa diukur dalam 30–90 hari.`,
    Developing: (c, s) => `Untuk ${c}, skor ${s}/100 menandakan pijakan yang mantap — proses inti sudah terdefinisi dan beberapa fondasi sudah ada. Ini saatnya beranjak dari perbaikan sepotong-sepotong ke rencana perbaikan terstruktur yang punya target.`,
    Defined: (c, s) => `Untuk ${c}, skor ${s}/100 mencerminkan kematangan operasional tingkat lanjut — pekerjaan sudah terstandar, ada penanggung jawabnya, dan terukur. Langkah berikutnya adalah memperluas yang sudah berhasil ke area yang belum tersentuh, sambil memperketat cara hasilnya dipantau.`,
    Optimising: (c, s) => `Untuk ${c}, skor ${s}/100 menempatkan Anda di antara organisasi yang operasinya benar-benar tertata. Di level ini sisa perolehannya bersifat berlipat: memperpendek jarak antara memutuskan dan bertindak, serta menghapus tempat-tempat terakhir di mana pekerjaan masih menunggu orang.`,
  },
  ui: {
    profileTitle: 'Mulai dari perusahaan Anda',
    profileSubtitle: 'Ini membantu kami menyesuaikan analisis dengan konteks Anda.',
    companyName: 'Nama perusahaan', companySize: 'Ukuran perusahaan', industry: 'Industri',
    selectIndustry: 'Pilih industri...', selectSize: 'Pilih ukuran perusahaan...',
    companyPlaceholder: 'mis. PT Maju Bersama',
    continue: 'Lanjut', back: '← Kembali ke profil', next: 'Berikutnya', seeResults: 'Lihat hasil',
    questionOf: (n, total) => `Pertanyaan ${n} dari ${total}`,
    resultsTitle: 'Laporan Analisis Operasional Bisnis Anda',
    resultsSubhead: (score, maturity) => `Skor ${score}/100 · kematangan ${maturity} — rincian lengkapnya di bawah.`,
    emailGateLabel: 'Ke mana laporan ini kami kirim?',
    emailPlaceholder: 'anda@perusahaan.com',
    emailCta: 'Kirim laporan saya',
    emailNote: 'Membuka unduhan laporan di bawah. Tanpa spam — alamat ini hanya kami pakai untuk mengirim laporan Anda.',
    emailInvalid: 'Masukkan alamat email yang valid.',
    sharePng: 'Bagikan sebagai gambar (PNG)', renderingPng: 'Menyiapkan gambar…',
    pdfDownloaded: 'Laporan PDF Anda sudah terunduh — cek folder unduhan Anda.',
    deliverySending: e => `Mengirim salinan ke ${e}…`,
    deliverySent: e => `Salinan sedang dalam perjalanan ke ${e}.`,
    deliveryFailed: 'Kami belum berhasil mengirim salinannya — unduhan di atas sudah berisi laporan lengkap.',
    emailUndeliverable: 'Domain itu tidak bisa menerima email — mohon periksa kembali alamatnya.',
    emailDidYouMean: s => `Maksud Anda ${s}?`,
    emailUseSuggestion: 'Pakai ini',
    languageLabel: 'Bahasa',
  },
  card: {
    quickAssessment: 'Analisis Singkat', ofBusinessOperations: 'Operasional Bisnis',
    companyName: 'Nama perusahaan', industryCategory: 'Kategori industri', industrySize: 'Ukuran perusahaan',
    score: 'Skor', operationalProfile: 'Profil operasional',
    workingForYou: 'Yang bekerja untuk Anda', holdingYouBack: 'Yang menahan Anda',
    strength: 'Kekuatan', blocker: 'Penghambat', notes: 'Catatan',
    rights: '© 2026 Aivory. Seluruh hak cipta dilindungi.',
    biggestConstraint: (top, topScore, rest) =>
      rest.length
        ? `Kendala terbesar Anda saat ini tampaknya ada di ${top} (${topScore}/100), disusul ${rest.join(' dan ')}.`
        : `Kendala terbesar Anda saat ini tampaknya ada di ${top} (${topScore}/100).`,
    allStrong: 'Tidak ada dimensi yang menahan Anda — kelimanya berada di atas level di mana otomatisasi bisa bertahan.',
    nextStep: d => `Langkah berikutnya yang biasanya paling berharga adalah meninjau secara terstruktur bagaimana ${d.toLowerCase()} dimiliki dan didokumentasikan.`,
    quickNoteTitle: (score, maturity) => `Catatan singkat: ${score}/100 — ${maturity}`,
    strongestDimension: (label, score) => `Dimensi terkuat: ${label} (${score}/100).`,
    needsImprovement: list => `Perlu diperbaiki: ${list}.`,
  },
  hook: {
    findingOne: 'Satu bagian operasional Anda berjalan di bawah level di mana otomatisasi bisa bertahan. Analisis ini menunjukkan di mana letaknya.',
    findingMany: w => `${w} bagian operasional Anda berjalan di bawah level di mana otomatisasi bisa bertahan. Analisis ini menunjukkan di mana letaknya.`,
    findingNone: 'Setiap dimensi operasional Anda berada pada atau di atas level di mana otomatisasi bisa bertahan — hasil yang tidak biasa, dan fondasi yang kuat untuk dibangun.',
    declineOne: 'Yang belum ditunjukkannya adalah berapa nilai memperbaikinya, mana yang harus dimulai lebih dulu, dan di mana AI bisa mengambil beban. Itu ada di Business Operations Analysis.',
    declineMany: 'Yang belum ditunjukkannya adalah berapa nilai memperbaikinya, mana yang harus dimulai lebih dulu, dan di mana AI bisa mengambil beban. Itu ada di Business Operations Analysis.',
    declineNone: 'Yang belum ditunjukkan analisis ini adalah mana di antaranya yang paling layak diperhatikan lebih dulu, berapa nilainya dalam waktu dan biaya yang bisa dihemat, dan di mana AI bisa mengambil beban. Itu ada di Business Operations Analysis.',
    countWords: ['Nol', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima'],
  },
  pdf: {
    generated: 'Dibuat', ref: 'Ref', page: 'Halaman 1 dari 1',
    ctaButton: 'Lihat Business Operations Analysis',
    docTitle: c => `Analisis Operasional Bisnis — ${c}`,
    docSubject: (score, maturity) => `Kematangan operasional ${score}/100 (${maturity})`,
  },
};

export function getAssessmentCopy(locale: Locale): AssessmentStrings {
  return locale === 'id' ? ID : EN;
}
