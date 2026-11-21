# Rencana Adopsi Orkas ke Aivory Cerveau

~ Agent baru, sistem automation, dan struktur departemen dengan Aira di puncak

^ Revisi 21 November 2026 (draf awal 18 November) · Basis: repo Orkas-AI/Orkas (MIT) dan dokumen internal docs/ (ADR-008, 009, 014, 020, 021, CERVEAU-NEW-AGENTS-PLAN, CERVEAU-WEB-RESEARCH-TOOLS-PLAN, CERVEAU-N8N-ORCHESTRATION-PLAN)

^ Perubahan di revisi ini: Geno menjadi shared service dengan scope baru (task dan follow-up keeper), bukan staf "Floating"; D4, bagian 7.2, 7.3, 7.7, 7.8, G7, roadmap dan risiko disesuaikan; angka roster dashboard dikoreksi dari 6 menjadi 9 agent. DeepResearcher tersedia mulai tier Business (D3). Verifikasi kode dashboard 2026-11-21: G1, G2, dan G6 terkonfirmasi sebagai celah di sisi UI dan API (G6 naik ke ukuran M karena butuh backend); catatan batas jadwal agent dan n8n (6.3) diperbarui. Revisi lanjutan: depth leader dari penghitungan di delegate.rs, nama Nara (D2), temuan catch-up dan posisi Geno sebagai hub saat ini.

## 1. Ringkasan

Dokumen ini menerjemahkan lima keputusan owner menjadi rencana kerja yang bisa dieksekusi. Sebelum menulis, seluruh ADR yang beririsan dibaca ulang, dan hasilnya mengubah beberapa asumsi dari diskusi awal (lihat bagian 2).

### Keputusan owner yang menjadi dasar

- **DeepResearcher** (nama agent: **Nara**, D2) dibuat sebagai agent baru yang terpisah, supaya Lex tidak kelebihan job desk dan tool. Tersedia mulai tier Business ($99) ke atas, karena riset adalah kebutuhan enterprise yang harus terakomodasi (D3).
- **OfficeWorker** dari Orkas diambil dan diserap oleh **Ofira** (sebagai skill, bukan agent baru).
- **Sistem automation** Orkas layak diadopsi, dan harus rapi bersanding dengan workflow builder n8n yang sudah ada.
- **Custom agent ditunda (hold)**.
- **Sistem departemen**: agent incumbent menjadi department leader, custom agent kelak menjadi worker atau staf. **Aira selalu di puncak.**
- **Geno** tidak menjadi leader departemen. Dia menjadi **shared service** dengan scope baru: task dan follow-up keeper untuk pekerjaan lintas departemen (bagian 7.8).

### Hal paling penting yang ditemukan

- **Scheduler tenant sudah jadi.** ADR-009 Fase 1 sampai 3b sudah deploy dan terverifikasi live (2026-09-05): eksekusi per-tenant, kuota per tier, reconcile 60 detik, tab Schedules, approval yang menunggu, dan kedaluwarsa 72 jam. Mengadopsi Orkas berarti *menutup celah*, bukan membangun dari nol.
- **Mesin delegasi sudah ada.** Aira sudah mendelegasikan ke lima agent dengan mode independent dan depth 2 (ADR-008). Ada juga envelope dan ledger (ADR-014), tool team_\* (ADR-021), dan Teams (ADR-020). Departemen dibangun di atas ini.
- **Ada keputusan batas 9 agent** (NEW-AGENTS-PLAN, 2026-11-09) karena routing Aira. Roster dashboard saat ini memang berisi 9 agent, jadi DeepResearcher menjadi agent ke-10 dan butuh keputusan owner. Struktur departemen adalah cara yang masuk akal untuk melonggarkan batas itu. Geno tidak menambah jumlah agent karena hanya diubah scope-nya.
- **Menambah satu agent mahal.** Ada lebih dari 10 titik sentuh yang masih hardcode (bagian 4). Itu alasan kuat agar departemen dan custom worker berbasis data, bukan enum.

### Urutan yang disarankan

| Langkah | Isi | Ukuran |
| 0 | Keputusan owner (D1 sampai D6, bagian 3) dan satu ADR baru untuk departemen | S |
| 1 | Fondasi: audit kondisi produksi, perbaikan web search (Tavily), probe harian, cek bug sandbox officecli, verifikasi semantik catch-up dan depth | S |
| 2 | Skill pack Office untuk Ofira | S sampai M |
| 3 | DeepResearcher (agent baru) beserta tool feed_read | M sampai L |
| 4 | Celah scheduler: end condition, catch-up, kontinuitas antar-run, tool schedule_propose | S sampai M |
| 5 | Departemen: mapping statis, re-scope Geno, enforcement edge delegasi, memory dan budget departemen, UI | M sampai L |
| 6 | Hold: spike custom worker, lalu bangun setelah departemen stabil | S lalu L |

^ Ukuran bersifat relatif (S, M, L), bukan estimasi hari, karena kapasitas tim tidak diketahui.

## 2. Koreksi terhadap asumsi awal

Beberapa hal yang disampaikan di diskusi sebelumnya ternyata tidak sesuai dengan kondisi repo. Tabel ini mencatat apa yang berubah dan dampaknya ke rencana.

| Asumsi awal | Fakta di repo | Dampak |
| Scheduler tenant masih menunggu sinkronisasi (status pending_activation). | Sudah deploy: tenant_sync.rs (reconcile 60 detik), store dan kuota Operational 1, Business 5, Enterprise 20, tab Schedules, approval yang parkir, dan kedaluwarsa 72 jam (ADR-009 §9 sampai §14, live 2026-09-05). Potongan kode yang gue baca awal berasal dari worktree lama. | Adopsi Orkas hanya untuk menutup celah (bagian 6), bukan membangun scheduler. |
| Klaim boundary atomik diperlukan karena ada dua instance (:3100 dan :3101). | Fleet sudah satu instance sejak 2026-09-12 (CERVEAU-STATUS). Reconcile sudah punya flag kepemilikan AVRY_TENANT_SCHEDULE_SYNC. | Klaim boundary turun menjadi hardening untuk scale-out (ADR-005), bukan prioritas. |
| Hierarki dengan Aira di atas perlu dirancang dari awal. | Sudah ada: Aira ke 5 agent (independent, depth 2), Geno dan spesialis (bounded, depth 1), invariant agar child tidak pernah lebih luas dari parent (ADR-008 §0). | Departemen adalah lapisan di atas mesin delegasi yang ada, bukan mesin baru. |
| Daftar AGENT_TYPES tersebar dan perlu direfactor dulu. | Sebagian sudah diturunkan dari AGENT_ROSTER (teams, active_agents, agent_profiles, telegram_service). Tetapi lebih dari 10 titik masih hardcode (NEW-AGENTS-PLAN §4). Di dashboard, roster hasil generate (agentRoster.generated.ts) kini berisi 9 agent (dicek 2026-11-21; angka 6 pada versi awal berasal dari generate 2026-09-17), dan tier Enterprise Ofira diatur di ENTERPRISE_AGENT_TYPES (lib/agentRoster.ts). | Refactor penuh bukan prasyarat. Tapi agent baru tetap mahal, dan itu mendorong struktur berbasis data. |
| Menambah agent itu bebas. | Ada keputusan batas 9 agent (alasan: routing Aira). Peran ala Gojiberry sengaja dijadikan skill module di Lex, bukan agent (NEW-AGENTS-PLAN §8). | DeepResearcher sebagai agent ke-10 adalah pengecualian beralasan yang harus dicatat (keputusan D1). |

## 3. Keputusan yang masih perlu owner

Setiap butir punya rekomendasi. Tidak ada pekerjaan besar yang sebaiknya dimulai sebelum D1 dan D4 diputuskan.

| # | Pertanyaan | Rekomendasi |
| D1 | Batas 9 agent: dilonggarkan menjadi berapa, dan kapan? | Izinkan agent ke-10 (DeepResearcher) dengan syarat eval routing Aira tidak turun dari baseline. Setelah departemen aktif, Aira hanya memilih di antara leader dan shared service, sehingga batas lama tidak lagi relevan. |
| D2 | Nama dan agent_type untuk DeepResearcher | **Diputuskan: nama Nara**, agent_type deep_researcher, judul usulan "Research & Evidence Agent". Catatan: akhiran "-ra" mirip Aira dan Mira; nama dipakai untuk @mention dan routing, jadi eval routing memuat kasus nama mirip dan @mention (lihat risiko). |
| D3 | Gating tier untuk DeepResearcher | **Mulai dari tier Business ($99) ke atas** (Business dan Enterprise); Operational tidak mendapat akses. Alasan: riset adalah kebutuhan enterprise yang harus terakomodasi, sementara biaya pencarian dan fetch serta risiko routing Aira dibatasi ke tenant berbayar tinggi. Tambahkan batas pencarian per run. Perluasan ke Operational ditinjau setelah satu bulan data biaya per run (D5). Catatan teknis: gating dashboard sekarang hanya punya flag boolean `enterprise` (ENTERPRISE_AGENT_TYPES), jadi perlu penanda tier minimum (misalnya minTier) dan penegakan di sisi server, bukan hanya ikon kunci di UI. |
| D4 | Posisi Geno dan DeepResearcher dalam departemen | **Keduanya shared service** yang melapor ke Aira dan dapat dipanggil leader mana pun. DeepResearcher: riset berbasis bukti. Geno: task dan follow-up keeper (bagian 7.8), berupa eksekutor tanpa delegasi lanjutan. Dengan ini aturan 7.3 tidak butuh pengecualian. agent_type Geno tetap autonomous. |
| D5 | Kuota jadwal per tier (1, 5, 20 per agent) setelah ada lebih banyak agent | Tahan dulu. Tinjau setelah satu bulan data biaya per run dari ledger. |
| D6 | Apakah departemen terlihat oleh end user di versi pertama? | Ya, tapi hanya sebagai pengelompokan di halaman Agents (leader di atas). Penyuntingan struktur menunggu custom worker. |

## 4. Workstream A: DeepResearcher sebagai agent baru

### Tujuan

Memisahkan riset mendalam dari Lex. Lex tetap fokus ke leads dan pipeline, dan jumlah tool plus MCP server di prompt-nya turun. Orkas menggambarkan DeepResearcher sebagai riset berbasis bukti: sumber terverifikasi, kontradiksi ditandai, laporan yang bisa diaudit.

### Batas peran

| Boleh | Tidak boleh |
| Riset prospek, kompetitor, pasar, regulasi, dan topik konten; laporan dengan sitasi, tingkat keyakinan, dan kontradiksi yang ditandai; mengembalikan hasil lewat handoff packet. | Mengirim pesan keluar, menulis ke CRM atau ERP, scraping situs yang butuh login (ditolak di ADR-006 D1), memberi saran investasi. |

### Tool (hanya baca)

- web_search_tool, web_fetch, Lightpanda dan Obscura untuk membaca halaman, recall memory dan graph, tool team_\*.
- feed_read (RSS/Atom) dari CERVEAU-WEB-RESEARCH-TOOLS-PLAN P1, karena cocok dengan riset terjadwal.
- Tidak ada tool tulis ke sistem bisnis. Hasil riset dipakai agent lain lewat handoff.

### Prasyarat teknis (ada bukti di docs)

- **Web search harus diperbaiki dulu.** Pengukuran 2026-10-04: 13 panggilan web_search_tool, hanya 2 berhasil, 11 gagal karena DuckDuckGo membatasi IP VPS. Perbaikannya konfigurasi saja (search_provider = tavily). Tanpa ini, DeepResearcher tidak berguna.
- **Pembungkus konten untrusted.** Belum diverifikasi apakah keluaran web_fetch dan web_search_tool dibungkus sebagai untrusted. Riset terbuka ke teks dari situs sembarang, jadi ini wajib dicek sebelum rilis.
- **Batas 180 detik per turn.** Riset besar harus berjalan sebagai delegate latar belakang atau jadwal, bukan satu turn sinkron.
- **Verifikasi silang.** verifier_brain (ADR-008 Fase 3a) bisa dipakai untuk memeriksa klaim bersitasi sebelum laporan diserahkan.

### Pola yang dipinjam

- Report skeleton dan aturan sample honest (NEW-AGENTS-PLAN §8): inti temuan, bukti, yang tidak bisa dipastikan, n kecil ditandai arah saja.
- Handoff packet dengan field tetap; field yang tidak diketahui ditulis [NEED: x], tidak ditebak.
- Progressive disclosure: satu SKILL.md router kecil plus referensi per jenis riset, sesuai prompt_injection_mode = compact.

### Titik sentuh yang harus dikerjakan

Daftar ini dari NEW-AGENTS-PLAN §4 dan berlaku sama untuk agent ke-10:

| Area | Item |
| Backend | agent_roster.py; seed agent_catalog (juga insert sekali di produksi); TOGGLEABLE_TOOLKITS; _ODOO_METHODS_BY_AGENT; action kinds; tes active_agents, tool_scope, mcp_servers |
| Cerveau (config.toml di VPS, bukan di git) | [agents.deep_researcher]; risk_profiles dan runtime_profiles (depth 1, compact, 10 iterasi); bundle skill dan MCP (maks 6 server); delegates dari Aira dan leader; peer_groups.room_team; IDENTITY.md; folder skills dan sync.sh |
| Bridge dan collab | telegram-agent.js (prompt, tool map), server.js (nama tampilan), is_known_agent di services/collab |
| Dashboard | generate:agent-roster; workspaceAccess KNOWN_AGENT_TYPES; avatar dan warna; kartu di halaman Agents; i18n; komentar migrasi ACL; gating tier minimum Business (perluasan flag enterprise di lib/agentRoster.ts, ikon kunci di AgentColumn dan MissionControl, dan penegakan server-side) |
| Lainnya | Addon Odoo (daftar selection); situs marketing (teks jumlah agent) setelah semuanya live |

### Kriteria selesai (target usulan)

- Set evaluasi 20 pertanyaan riset: setidaknya 90% klaim punya URL sumber yang bisa dibuka, dan kontradiksi yang sengaja disisipkan terdeteksi.
- Nol aksi tulis ke sistem bisnis di seluruh set evaluasi.
- Eval routing Aira tidak turun dari baseline sebelum dan sesudah agent ke-10 ditambahkan (harness eval ada di ERP-SCALING-PLAN Fase 0).
- Biaya per run terukur lewat ledger dan batas pencarian per run bekerja.

^ Ukuran: M sampai L (karena banyaknya titik sentuh). feed_read sendiri M.

## 5. Workstream B: skill pack Office untuk Ofira

OfficeWorker Orkas membuat, mengedit, memeriksa, dan mengirim file Word, Excel, PowerPoint, dan PDF, satu per satu atau massal, memakai OfficeCLI. Ofira sudah punya officecli dan pdf-oxide sebagai tool stdio. Jadi yang diambil adalah **perilaku**, bukan tool baru.

> **Blocker yang perlu dicek dulu:** dokumen 2026-08-23 mencatat officecli, lightpanda, dan pdf-oxide gagal dieksekusi dengan *Permission denied (os error 13)* di jalur sandbox Landlock, ditandai masih terbuka. Status terkininya belum diverifikasi. Tanpa perbaikan ini, skill pack tidak bisa jalan.

- **Skill bundle office-worker** dengan router SKILL.md kecil dan referensi per format (docx, xlsx, pptx, pdf), mengikuti pola progressive disclosure.
- **Mode batch:** daftar file masuk, tabel hasil per file keluar; satu file gagal tidak menghentikan batch.
- **Langkah verifikasi:** buka ulang file keluaran dan periksa (jumlah halaman, sheet, rumus, placeholder kosong) sebelum dilaporkan selesai.
- **Pengiriman:** simpan ke Drive atau Docs lewat toolkit yang sudah terhubung; pengiriman email tetap lewat gerbang approval F-1.
- **PPT:** PptMaker Orkas dilipat ke skill yang sama pada tahap kedua.

Catatan: Ofira saat ini dikunci untuk tier Enterprise (ENTERPRISE_AGENT_TYPES di lib/agentRoster.ts, dikonfirmasi 2026-11-21). Perlu diputuskan apakah skill baru ini tetap terkunci. Kriteria selesai: set dokumen golden, batch 10 file dengan tabel hasil, dan satu kegagalan sengaja yang tidak merusak batch. Ukuran: S sampai M setelah blocker beres.

## 6. Workstream C: automation dari Orkas

### 6.1 Yang sudah ada di Aivory (ADR-009)

| Kemampuan | Status |
| Scheduler zeroclaw: cron 5 field, one-shot, interval, zona waktu IANA, jalankan job agent atau shell, run history | Ada (bawaan runtime) |
| Eksekusi per-tenant di dalam TENANT_CONTEXT, resolusi tenant saat fire | Live (Fase 1) |
| Store product.tenant_scheduled_runs, CRUD, kuota 1/5/20, penolakan frekuensi berbahaya | Live (Fase 2) |
| Reconcile 60 detik, kepemilikan baris eksplisit, next_run hanya dihitung ulang saat jadwal berubah | Live (Fase 2b) |
| Tab Schedules (daily, weekdays, weekly, monthly), zona waktu otomatis dari browser, tampilan kuota dan kredit | Live (Fase 3, 3a) |
| Approval dari run tanpa pengawasan: diparkir, kedaluwarsa 72 jam, ditandai di jadwal | Live (Fase 3b) |
| Pengingat antar-agent (team_remind), tugas terlacak (team_delegate) | Ada (ADR-021) |

### 6.2 Celah dibanding Orkas

Orkas menyimpan tiap task sebagai direktori (config.json, attachments, handoff), menjadwalkan lewat timer per task, dan mengeksekusi lewat chat bus. Sebagian besar mekanisme itu khas desktop (powerMonitor, device binding) dan **tidak** perlu ditiru. Yang relevan:

| # | Celah | Di Orkas | Di Aivory | Usulan | Uk. |
| G1 | Jadwal sekali jalan dan batas berhenti | one_time; end_condition berdasarkan tanggal atau jumlah kemunculan (run manual tidak dihitung) | Runtime mendukung one-shot dan delete_after_run; UI hanya 4 cadence; dikonfirmasi di kode dashboard (2026-11-21): tidak ada opsi Sekali dan tidak ada field end condition di API create/update | Tambah opsi Sekali dan Berhenti setelah (tanggal atau N kali). Untuk pengingat murni tetap pakai team_remind. | S |
| G2 | Kontinuitas antar-run | Percakapan dipakai ulang dan handoff/note.md membawa state ke run berikutnya | Tiap run sesi baru (cron-run-N); ada flag uses_memory; API dan UI dashboard tidak punya opsi carry-over (input hanya name, prompt, cron_expression, timezone; dikonfirmasi 2026-11-21), perilaku runtime belum dicek | Sisipkan ringkasan hasil run terakhir (dari run history, dibatasi panjangnya, dibingkai sebagai data lama yang mungkin basi) ke prompt run berikutnya. | M |
| G3 | Kebijakan catch-up | Hanya kemunculan terbaru, maksimal 12 jam, sekali jalan, diabaikan bila jadwal diedit setelahnya | catch_up_on_startup = true (config). Dibaca di scheduler.rs (2026-11-21): saat startup tiap job overdue dijalankan satu kali (bukan semua boundary yang terlewat), tanpa batas umur, dan mengabaikan max_tasks; semua job overdue lintas tenant bisa jalan serentak setelah restart. Konkurensi claim_due_jobs dan process_due_jobs belum dibaca. | Tambahkan jendela umur maksimum (aturan Orkas: 12 jam) dan batasi konkurensi catch-up; uji dengan job yang overdue berhari-hari. Risiko yang ditutup adalah lonjakan serentak dan run basi, bukan run berulang. | S |
| G4 | Agent membuat jadwal dari chat | Tool auto_tasks (list, get, create, update, delete), validasi ketat, tanpa konfirmasi | Ditandai paling akhir di ADR-009 Fase 4; tool cron_add tidak dibuka ke tenant | Tool schedule_propose: agent mengusulkan, baris dibuat belum aktif, pengguna menyetujui di tab Schedules. Wajib ada persetujuan karena risiko biaya (ADR-009 §6). | M |
| G5 | Status run waiting_input | Ada | Sudah ada lewat InputRequired dan approval yang kedaluwarsa | Tidak ada celah. | - |
| G6 | Riwayat run dan biaya per run terlihat pengguna | Kartu hasil di chat | ADR-009 Keputusan 6 mensyaratkannya. Dikonfirmasi di kode dashboard (2026-11-21): tipe ScheduledRun tidak punya field hasil, waktu run terakhir, atau biaya; hanya last_synced_at (waktu sinkronisasi, bukan waktu run). Tab Schedules hanya menampilkan status, kuota, kredit, dan approval yang kedaluwarsa. | Celah nyata. Tambahkan field atau endpoint di backend (hasil, waktu, dan biaya run terakhir), lalu tampilkan di tab Schedules. | M |
| G7 | Auto-advance (tim mengambil to-do berikutnya sendiri) | Per project, nyala atau mati | Ada papan agent_tasks, team_delegate, dan Aira | Jangan bangun subsistem baru. Setelah departemen aktif, implementasikan sebagai jadwal Aira yang meninjau papan dan merutekan ke **Geno** (task keeper, bagian 7.8) atau leader terkait, dengan budget. Tahan sampai itu. | Hold |

### 6.3 Batas antara jadwal agent dan n8n

Dua mesin penjadwal dengan semantik berbeda akan membingungkan pengguna dan menyulitkan penelusuran biaya. Aturan yang diusulkan:

| | Jadwal agent (Cerveau) | Workflow n8n |
| Cocok untuk | Tugas yang butuh penilaian, ringkasan, atau keputusan (laporan mingguan, tinjauan tiket, riset) | Urutan langkah pasti lintas sistem (lead capture, eskalasi support, handoff tugas, notifikasi approval) |
| Pemilik cron | Cerveau adalah pemilik tunggal untuk run agent | Trigger cron n8n sah untuk alur deterministik |
| Saling memanggil | Jadwal agent boleh memicu workflow lewat tool trigger_\* (CERVEAU-N8N-ORCHESTRATION-PLAN) | n8n memanggil agent lewat webhook; tidak membuat jadwal agent sendiri |
| Approval | Gerbang F-1 sekali per pemicu | Tidak menambah gerbang kedua di dalam alur |

^ Catatan (dicek di kode dashboard 2026-11-21, lewat pencarian kata kunci, bukan pembacaan penuh 2.271 baris app/workflows/page.tsx): builder berbasis n8n; workflow aktif hanya bila sudah di-deploy ke n8n. Node Schedule di builder mendukung interval menit, jam, hari, dan minggu tanpa batas frekuensi, sedangkan tab Schedules agent menolak frekuensi berbahaya. Komponen workflow tidak punya referensi ke agent Cerveau, jadi pola trigger_\* dan webhook ke agent belum punya sisi dashboard. Batas di atas perlu dicek terhadap backend dan n8n sebelum diumumkan ke pengguna.

### Kriteria selesai

- G1 dan G3: tes otomatis untuk jadwal sekali, berhenti setelah N, dan restart setelah downtime tidak menghasilkan lebih dari satu run susulan.
- G2: dua run berurutan, run kedua dapat membandingkan dengan hasil run pertama; ringkasan tidak melebihi batas karakter.
- G4: usulan jadwal dari chat tidak pernah aktif tanpa persetujuan pengguna; kuota tetap ditegakkan; pesan error generik ke model.

## 7. Workstream D: sistem departemen

### 7.1 Konsep dan hubungannya dengan Teams

**Team** (ADR-020, sudah ada: tabel teams, endpoint /api/v1/teams, halaman /agents/teams) adalah kumpulan agent untuk satu room atau channel, dipakai untuk menentukan siapa yang saling melihat. **Departemen** adalah struktur organisasi: siapa melapor ke siapa, siapa boleh mendelegasikan ke siapa, serta batas izin, memory, dan budget bersama. Keduanya berdampingan. Team tetap mengatur akses channel, departemen mengatur wewenang.

### 7.2 Struktur awal

| Departemen | Leader | Catatan |
| Eksekutif / koordinasi | Aira (Chief of Staff) | Root. Selalu di puncak. Menerima permintaan dan merutekannya ke leader atau shared service. |
| Sales | Lex | Setelah DeepResearcher terpisah, tool riset dilepas dari Lex. |
| Support | Teo | |
| Finance | Finn | |
| Marketing | Mira | Menurut rencana, Ivo, Juno, dan Mira dirilis berurutan; status rilisnya perlu dicek. |
| Operations | Juno | Status rilis perlu dicek. |
| Data & Reporting | Ivo | Forecast sudah dipindah dari Geno ke Ivo (keputusan 2026-11-09). Status rilis perlu dicek. |
| Admin / Office | Ofira | Menyerap skill pack Office. |
| Shared service | Nara (DeepResearcher), Geno | Melapor ke Aira, dapat dipanggil leader mana pun (D4). Nara: riset berbasis bukti. Geno: task dan follow-up keeper lintas departemen (bagian 7.8). Keduanya eksekutor, tanpa delegasi lanjutan. |

### 7.3 Aturan delegasi

- Aira mendelegasikan ke leader dan shared service, tidak langsung ke staf departemen.
- Leader mendelegasikan ke staf departemennya sendiri dan ke shared service.
- Staf tidak mendelegasikan ke siapa pun. Permintaan lintas departemen naik lewat leader atau Aira, dicatat sebagai handoff packet di ledger. Artinya staf tidak bisa memanggil shared service secara langsung; itu disengaja.
- Shared service tidak mendelegasikan lagi. Itu ditegakkan lewat dua hal: delegation_policy di risk profile tidak mengizinkan delegasi (tanpa [[delegates]]) dan runtime profile max_delegation_depth = 1. Shared service harus punya tool sendiri untuk menyelesaikan tugasnya.
- Kedalaman maksimum tetap dua lompatan (Aira ke leader ke staf atau shared service). **Dibaca dari delegate.rs (2026-11-21, tes belum dijalankan):** batas yang dibawa tiap hop adalah min(batas parent, batas profil target), jadi rantai hanya bisa makin ketat. Akibatnya Aira (batas 2) ke leader yang batasnya 1 membawa batas 1, dan delegasi leader ditolak. Nilai yang dibutuhkan: Aira 2 (sudah), **leader 2 (sekarang 1; dinaikkan di D1)**, staf dan shared service 1 dengan policy delegasi yang tidak mengizinkan. Jangan pakai 0 untuk 'tidak boleh delegasi': nilai 0 difilter dan jatuh ke default 3 (ADR-025 §2 dan §3).
- Guardrail yang sudah ada dipakai ulang, bukan dibuat baru: max_delegation_depth, budget per jam dan per hari per agent, context_turn_cap, loop detector, velocity_gate, dan pembingkaian output peer sebagai untrusted (ADR-008 dan ADR-014).

### 7.4 Izin, approval, dan budget

- **Izin:** invariant yang sudah ada (policy.rs) menolak subagent yang melebihi parent. Plafon departemen ditambahkan di atasnya: tool scope staf adalah subset dari plafon departemen.
- **Approval tetap ke manusia** lewat gerbang F-1 dan halaman Approvals. Leader adalah LLM juga, jadi tidak boleh menjadi penyetuju.
- **Budget:** satu budget total per permintaan di level Aira, ditambah budget agregat per departemen (baru). Tujuannya agar satu permintaan tidak berubah menjadi puluhan panggilan LLM.

### 7.5 Memory

Tambahkan scope **department** (fakta bersama departemen) di atas memory per agent, mirip scope project di Orkas. Sebelum desain final, silang-cek ADR-004 (lifecycle), ADR-016 (recall), dan ADR-024 (curation), karena sebagian kebutuhan mungkin sudah tertangani di sana. Bagian ini belum dibaca penuh.

### 7.6 Model data (usulan)

| Tabel | Kolom kunci |
| departments | id, tenant_id (kosong untuk departemen sistem), key, name, leader_ref, created_at |
| department_members | department_id, agent_ref, role (leader / staff / shared_service) |
| agent_ref | Referensi, bukan enum: agent_type untuk agent bawaan, id untuk custom worker kelak. Mencegah refactor ulang saat custom agent dibuka. |

- Semua tenant mendapat departemen sistem dari roster bawaan tanpa setup (hanya baca).
- Pengiriman ke Cerveau memakai pola ADR-020 §3.2: header tambahan di samping X-Active-Agents. Roster delegasi menjadi irisan dari reachable_delegate_targets, active_agents, dan edge departemen. Bila header tidak ada, perilaku lama dipertahankan (fail-open). Ini masa transisi: tetapkan kapan perilaku berubah menjadi fail-closed, karena selama fail-open uji admission hanya melindungi request yang membawa header.

### 7.7 Fase departemen

| Fase | Isi | Uk. |
| D0 | ADR baru: definisi, edge, data model, keputusan D1 sampai D6 | S |
| D1 | Mapping statis: delegates di config, IDENTITY.md (daftar rekan), roster, pengelompokan di halaman Agents; re-scope Geno sebagai shared service (prompt, title, tool scope; agent_type tetap); naikkan max_delegation_depth leader dari 1 ke 2 (staf dan shared service tetap 1) | M |
| D2 | Enforcement edge di Cerveau (irisan roster di skema dan di admission, bukan hanya filter prompt) plus tes header hilang dan set kosong; kasus leader lewat Aira, leader dipanggil langsung (berhenti di staf), dan staf atau shared service yang mencoba mendelegasikan | M |
| D3 | Scope memory departemen dan budget agregat | M |
| D4 | UI org chart sederhana dan indikator biaya per rantai delegasi dari ledger | M |

### 7.8 Geno: task dan follow-up keeper

Setelah departemen aktif, setiap domain punya leader, sehingga peran generalis murni tumpang tindih. Yang tersisa tanpa pemilik adalah ekor panjang pekerjaan lintas departemen: tugas multi-langkah, pengingat, dan status tindak lanjut. Itu scope baru Geno. Pembagiannya dengan Aira: **Aira memutuskan dan merutekan, Geno menjalankan dan mengejar sampai selesai.**

- **Posisi:** shared service, melapor ke Aira, dapat dipanggil leader mana pun (D4). Tidak menambah jumlah agent, sehingga tidak kena batas 9 agent.
- **Scope:** memiliki tugas lintas departemen yang tidak punya rumah, mengejar tindak lanjut, menyusun ringkasan status dan laporan progres. Menjadi eksekutor untuk G7 (auto-advance papan tugas) setelah departemen stabil.
- **Tool:** memakai yang sudah ada: agent_tasks, team_remind, team_delegate (hanya untuk membuat dan melacak tugas, bukan untuk melempar pekerjaan ke agent lain), recall memory, dan hasil run dari ledger. Tidak ada tool tulis baru ke sistem bisnis.
- **Batas:** tidak mendelegasikan lagi (policy delegasi tidak mengizinkan, depth 1). Bila delegasi lanjutan dibutuhkan, itu mengubah batas dua lompatan dan harus lewat ADR terpisah.
- **Yang berubah:** title, prompt, dan tool scope. **agent_type tetap autonomous** karena nilai itu masih hardcode di banyak titik sentuh (bagian 4). Nama Geno tidak berubah.
- **Yang dilepas:** peran generalis penjawab apa saja. Permintaan yang tidak cocok ke departemen mana pun tetap ditangani Aira sebagai Chief of Staff. Saat ini Geno adalah hub (config 2026-11-21): delegasi bounded keluar ke Teo, Lex, Finn, dan Ofira, dan Finn serta Ofira mendelegasikan balik. Delegasi keluar itu dihapus; edge balik dari leader ke Geno tetap sah sebagai leader ke shared service. Ini perubahan perilaku untuk pengguna Geno yang ada; ukur dulu dengan geno_usage.sql (ADR-025 Q2).
- **Alternatif yang ditolak:** personal assistant atau inbox (tumpang tindih dengan Ofira), penulis atau drafter (tumpang tindih dengan Mira), triage atau fallback murni (sudah tugas Aira).

### Kriteria selesai

- Set permintaan lintas departemen dirutekan ke agent yang benar setidaknya sebaik baseline.
- Uji admission: leader tidak bisa mendelegasikan keluar edge yang diizinkan; staf tidak bisa mendelegasikan sama sekali; shared service tidak bisa mendelegasikan lagi.
- Biaya satu rantai Aira ke leader ke staf terlihat di ledger dan tidak melebihi budget per permintaan.
- Geno: set tugas lintas departemen (tugas multi-langkah, pengingat, laporan status) selesai tanpa delegasi lanjutan; perilaku untuk pengguna Geno yang ada dibandingkan sebelum dan sesudah re-scope.

## 8. Workstream E: custom worker (hold)

Ditahan sesuai keputusan. Yang dikerjakan sekarang hanya memastikan desain tidak menutup jalan. Prasyarat sebelum dibuka:

- **Identitas dinamis:** agent_ref (7.6) dipakai di semua titik sentuh, bukan enum agent_type.
- **Spike S1 di sisi Rust:** agent di Cerveau saat ini didefinisikan statis di config.toml (di VPS, bukan di git), dengan overlay tenant per agent_type. Perlu dibuktikan apakah worker kustom bisa berupa persona overlay tenant di atas satu worker brain generik, dengan scope memory sendiri dan tool scope yang dibatasi resolver, tanpa menyunting config.toml. Hasil spike ini menentukan seberapa besar pekerjaan ini.
- **Plafon izin:** tool scope worker adalah subset dari leader dan plafon departemen.
- **Kuota dan kredit:** jumlah worker per tier dan batas biaya.
- **Keamanan:** teks persona dari pengguna adalah vektor prompt injection; perlu pemindaian dan pembingkaian sebelum disuntikkan.
- **Pembuatan dari deskripsi peran:** pola Commander di Orkas (agent dibuat dari peran yang dideskripsikan) menjadi acuan UI.

## 9. Roadmap dan ketergantungan

| Fase | Isi | Bergantung pada | Selesai bila |
| P0 | Keputusan D1 sampai D6; ADR departemen | - | Keputusan tercatat |
| P1 | Fondasi: audit kondisi produksi (scheduler, officecli, rollout Ivo/Juno/Mira, harness eval routing: jalankan evals/aira-routing), Tavily (web research P0), probe harian (P4), status bug officecli, semantik catch-up dan depth, cek pembungkus untrusted | - | Web search berhasil di produksi; hasil cek terdokumentasi |
| P2 | Skill pack Office untuk Ofira | P1 (bug sandbox) | Set golden lulus, batch aman |
| P3 | DeepResearcher (dan feed_read) | P0 (D1 sampai D3), P1 | Eval riset dan eval routing lulus |
| P4 | Celah scheduler G1, G3, G6, lalu G2 dan G4 | P1 (G3) | Tes per celah lulus |
| P5 | Departemen D1 sampai D4, termasuk re-scope Geno | P0; D2 butuh P3 untuk edge shared service DeepResearcher | Eval routing dan uji admission lulus |
| P6 | Spike S1, lalu custom worker | P5 stabil | Keputusan bangun atau tidak berdasarkan S1 |

^ P2, P3, dan P4 menyentuh area berbeda sehingga bisa berjalan paralel. P5 dapat mulai dari D0 dan D1 selagi P3 berjalan. Konfigurasi produksi Cerveau berada di VPS dan bukan di git, jadi setiap perubahan config memakai prosedur backup, doctor sebelum dan sesudah, lalu restart bertahap seperti yang sudah dipakai.

## 10. Risiko dan mitigasi

| Risiko | Dampak | Mitigasi |
| Agent ke-10 menurunkan akurasi routing Aira | Permintaan salah alamat, biaya naik | Eval routing sebelum dan sesudah; DeepResearcher hanya memiliki edge sempit; departemen mempersempit pilihan Aira |
| Rantai delegasi tiga lapis melipatgandakan panggilan LLM | Biaya kejutan, timeout 180 detik | Batas dua lompatan, budget per permintaan di Aira, delegate latar belakang untuk riset besar |
| Gating tier hanya di UI (flag enterprise sekarang hanya ikon kunci) | Tenant Operational bisa memanggil DeepResearcher lewat jalur lain dan menanggung biaya riset | Penegakan tier minimum di server (active_agents dan admission), bukan hanya di dashboard; tes akses per tier |
| Depth leader tidak dinaikkan, atau 0 dipakai sebagai 'tidak boleh delegasi' | Rantai Aira ke leader ke staf ditolak, atau shared service justru boleh mendelegasikan sampai depth 3 | Leader 2, staf dan shared service 1 plus policy delegasi; tes admission per kombinasi (ADR-025 §3) |
| Nama Nara mirip Aira dan Mira (akhiran -ra) | @mention dan routing keliru | Kasus nama mirip dan @mention di eval routing; tinjau lagi nama bila eval menunjukkan salah rute |
| Hasil riset memuat teks berbahaya dari web | Prompt injection ke turn yang auto-approve | Verifikasi pembungkus untrusted sebelum rilis; DeepResearcher tanpa tool tulis |
| Re-scope Geno mengubah perilaku untuk pengguna yang sudah memakainya sebagai generalis | Keluhan, permintaan umum tidak terjawab | agent_type tetap; permintaan umum ditangani Aira; bandingkan perilaku sebelum dan sesudah; umumkan perubahan scope |
| Shared service dipanggil leader tapi butuh delegasi lanjutan | Tugas macet di batas depth | Geno dan DeepResearcher dirancang sebagai eksekutor; kebutuhan delegasi lanjutan lewat ADR terpisah |
| Lonjakan run susulan setelah deploy atau restart | Biaya tiba-tiba dan duplikasi hasil | Aturan catch-up G3 diuji sebelum fitur jadwal diperluas |
| Agent membuat jadwal sendiri tanpa kendali | Biaya berulang tanpa pengawasan | schedule_propose wajib persetujuan; kuota per tier; penolakan frekuensi berbahaya tetap berlaku |
| Dua penjadwal (Cerveau dan n8n) membingungkan pengguna | Debug dan penagihan sulit; node Schedule workflow mengizinkan interval menit tanpa batas frekuensi | Aturan batas 6.3, satu halaman dokumentasi pengguna, dan batas frekuensi minimum di node Schedule workflow |
| Sandbox officecli masih rusak | Skill pack Office tidak berfungsi | Cek dan perbaiki di P1 sebelum P2 dimulai |
| Konfigurasi produksi di luar git menyimpang antar-lingkungan | Perilaku tidak konsisten | Ikuti ADR-011 (drift konfigurasi) dan cermin redacted di ops/cerveau-config |

## 11. Backlog dari Orkas yang belum dipilih

Dari review awal, ide berikut tidak masuk keputusan owner tetapi layak dicatat. Semuanya perlu disilangkan dulu dengan ADR-004, 013, 016, dan 024 karena kemungkinan sebagian sudah tertangani.

- Pemindaian injeksi saat menulis memory (frasa injeksi, perintah exfiltrasi, karakter kontrol bidi), hanya melaporkan kategori kegagalan.
- Kapasitas memory kecil dengan penolakan eksplisit saat penuh, lalu konsolidasi oleh model, alih-alih eviction diam-diam.
- Batch edit memory dengan revisi yang diharapkan (optimistic concurrency).
- Loop refleksi saat idle: per agent, hanya jika ada aktivitas baru, dengan cooldown eksponensial dan batas jumlah agent per siklus.
- Klaim boundary atomik per jadwal untuk scale-out horizontal (ADR-005).

## 12. Basis fakta dan hal yang belum diverifikasi

### Dibaca langsung

- Orkas: README, memory.ts, reflection-orchestrator.ts, auto_tasks.ts (hampir penuh, 6.992 karakter terakhir tidak terbaca), auto_tasks_tool.ts, builtin_marketplace.ts. Nama agent bawaan diambil dari README karena folder agent di repo memakai id heksadesimal dan agent.json tidak dibuka.
- Aivory: ADR-009 (hampir penuh), ADR-020, ADR-021, ADR-008 (bagian awal), ADR-014 (bagian awal), CERVEAU-N8N-ORCHESTRATION-PLAN, CERVEAU-NEW-AGENTS-PLAN, CERVEAU-WEB-RESEARCH-TOOLS-PLAN, CERVEAU-STATUS (bagian awal), agent_roster.py, teams.py (kepala berkas), tenantScheduledRuns.ts (kepala berkas).
- Repo dashboard (dicek 2026-11-21): lib/agentRoster.ts dan lib/agentRoster.generated.ts (9 agent; ENTERPRISE_AGENT_TYPES berisi office_assistant); components/agents/SchedulesTab.tsx dan lib/tenantScheduledRuns.ts (tipe ScheduledRun, cadence, kuota, kredit, approval kedaluwarsa); ScheduleForm.tsx di workflow builder; app/workflows/page.tsx hanya lewat pencarian kata kunci.
- Monorepo (dicek 2026-11-21): ops/cerveau-config/config.redacted.toml (cermin, bukan config produksi), cron/scheduler.rs (jalur catch-up saat startup), tools/delegate.rs (penghitungan depth), dan ADR-025 (draf).

### Belum diverifikasi

- Kode Rust Cerveau selain bagian yang sudah dibaca: jalur admission di delegate.rs dan konkurensi catch-up (claim_due_jobs, process_due_jobs). Tes delegate.rs belum dijalankan.
- Status terkini bug sandbox officecli dan status rollout Ivo, Juno, dan Mira.
- Halaman workflow builder n8n hanya dicek lewat pencarian kata kunci (bukan pembacaan penuh), dan satu file (components/workflow/AddWithAivoryPanel.tsx) cocok dengan kata kunci agent tetapi belum dibaca.
- Sisi backend dan runtime untuk jadwal: apakah ada data hasil run terakhir yang belum diekspos ke dashboard, dan apakah runtime membawa state antar-run (dashboard memastikan UI dan API-nya tidak mengekspos keduanya).
- ADR-004, 013, 016, 024 (memory) dan bagian akhir ADR-008 dan ADR-014.
- Harness eval routing: tidak ditemukan saat pencarian 2026-11-21 (evals/ hanya berisi typesafe-jev). Harness awal diajukan di AVRY-V2-Main#70 (evals/aira-routing), belum dijalankan ke model; gate D1 menunggu hasilnya.
- Apakah tool agent_tasks dan team_delegate dapat dipakai Geno sebagai shared service tanpa perubahan depth.
- Semua klaim 'live' berasal dari tanggal di dokumen (sebagian besar September 2026); kondisi produksi hari ini belum dicek.

^ Sumber eksternal: github.com/Orkas-AI/Orkas (lisensi MIT; salinan potongan kode wajib menyatakan atribusi).
