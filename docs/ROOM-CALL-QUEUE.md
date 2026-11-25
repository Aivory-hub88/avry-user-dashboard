# Room call queue (2026-11-25)

**Masalah.** Pesan `@all` di Room punya 10 agent. Dulu giliran dibatasi 5 serentak dan sisanya
tampil dengan spinner yang sama persis seperti agent yang sedang bekerja; bubble juga tersusun
menurut urutan roster, sehingga agent lambat di atas mendorong jawaban yang sudah selesai ke bawah.
Lonjakan 10 panggilan LLM sekaligus pada satu kunci juga berisiko memicu rate limit, dan satu 429
muncul sebagai toast "X is unavailable".

## Riset (ringkas)

| Sumber | Pola yang relevan | Dipakai? |
|---|---|---|
| OpenClaw ([queue](https://docs.openclaw.ai/concepts/queue), [parallel specialist lanes](https://docs.openclaw.ai/concepts/parallel-specialist-lanes)) | Antrean berlajur FIFO dengan batas global; satu turn per sesi; *priority aging* (foreground menyalip normal maksimal 15 dtk, background 30 dtk); mode steer/followup/collect/interrupt; debounce 500 ms; `cap` 20 + `drop: summarize`; notifikasi "queued for Nms" bila menunggu >2 dtk | Prioritas + aging + posisi antre jujur. Mode steer/collect/debounce belum (lihat "Belum") |
| [Nakama](https://github.com/ahmadrosid/nakama) (ahmadrosid) | Satu turn per sesi ("busy"), *first-token deadline* dan *overall deadline* per turn. Dokumentasinya **tidak** menjelaskan routing grup atau antrean antar-agent | Hanya ide deadline, belum dibangun |
| [AutoGen SelectorGroupChat](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/selector-group-chat.html) | Model memilih pembicara berikutnya dari nama + deskripsi agent; fungsi kandidat mempersempit pilihan; pembicara yang sama tidak dipilih berturut-turut | Versi deterministik tanpa biaya: peringkat menurut peran (`lib/roomPriority.ts`) |
| CrewAI / praktik komunitas (artikel dan diskusi, bukan dokumentasi resmi) | `max_rpm`, semaphore 10–20 panggilan, retry **di dalam** tiap agent supaya satu 429 tidak membatalkan agent lain; *racing* (batalkan sisanya saat satu selesai) menukar komputasi dengan kecepatan | Semaphore adaptif + retry per agent. Racing **tidak** dipakai: semua agent @all memang harus menjawab |

Catatan jujur: OpenClaw dan AutoGen dibaca dari dokumentasi resminya; angka default OpenClaw
berbeda antar versi. Pola CrewAI berasal dari diskusi komunitas, bukan fitur terverifikasi.

## Desain

- `lib/callGovernor.ts`: gerbang tunggal di depan setiap panggilan agent. Antrean berprioritas
  dengan *aging* (naik satu peringkat per 15 dtk menunggu), batas adaptif AIMD (mulai 6, min 2,
  maks 10; rate limit membagi dua, 4 hasil bersih berturut-turut menambah satu), posisi antre
  yang dilaporkan, dan pembatalan bersih saat user menekan Stop.
- `lib/roomPriority.ts`: urutan masuk: agent yang disebut user (0), pemegang floor (1), lalu
  kecocokan peran (leksikon ID/EN), lalu urutan room. Hanya mengatur urutan, tidak pernah membuang
  agent.
- `hooks/useChat.ts`: setiap giliran Room lewat governor; handoff dan retry masuk dengan peringkat
  -1; kegagalan `rate_limited`/`transient` diulang maksimal 2 kali dengan backoff 1,5/3 dtk
  (+jitter); kegagalan lain tetap toast seperti dulu.
- `lib/roomRound.ts`: `MAX_PARALLEL_TURNS` tidak lagi membatasi (governor yang membatasi) dan
  `orderByArrival` menyusun bubble menurut siapa yang selesai duluan.

## Belum dikerjakan

- Deadline token pertama dan deadline total per giliran (ide Nakama).
- Antrean pesan user saat ronde masih berjalan: collect/debounce/cap ala OpenClaw.
- Pembatas laju di sisi backend/Cerveau. Governor ini hanya per-tab, jadi dua tab atau dua user
  tetap menjumlah beban pada kunci yang sama.
- Pengukuran: belum ada data nyata apakah batas awal 6 pas.
