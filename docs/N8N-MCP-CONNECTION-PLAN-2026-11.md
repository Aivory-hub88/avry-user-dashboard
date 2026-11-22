# Rencana: koneksi n8n lewat MCP

Status: draf untuk review. Belum ada kode yang diubah. Dibuat 2026-11-22.

## 1. Tujuan

Selain mengisi instance URL + API key n8n, user bisa menyambungkan n8n mereka lewat MCP, supaya workflow n8n yang mereka expose bisa ditemukan dan dipanggil dari Aivory tanpa mereka tahu URL webhook atau ID workflow.

## 2. Kondisi sekarang (hasil baca kode)

| Hal | Fakta | Lokasi |
|---|---|---|
| Koneksi n8n | Instance URL + API key, disimpan terenkripsi per user | `lib/workflows/n8nCredentialsServer.ts`, `app/api/user/credentials/route.ts` |
| Arah koneksi | Aivory mendorong workflow ke n8n user lewat REST API, lalu membaca executions | `app/api/workflows/activate/route.ts`, `app/api/n8n/workflow/[id]/executions/route.ts` |
| Workflow builder | Menyusun node lalu mengompilasinya ke JSON n8n. Runtime-nya n8n, bukan Aivory | `lib/workflows/nodeMapper.ts`, `types/workflow-node.ts` |
| MCP client | Sudah ada untuk agent: register server, verifikasi dengan guard SSRF di backend, daftar tools, disable tool. Per `agent_type`, Pro/Enterprise | `lib/tenantMcpServers.ts`, backend `/api/v1/tenant-mcp-servers` |
| Validasi URL n8n | Hanya cek protokol http/https | `lib/workflows/credentialStore.ts` (`isValidN8nUrl`) |
| "n8n-MCP" di kode | Community `n8n-mcp`, dipakai internal untuk validasi schema node. Bukan koneksi milik user | `app/api/console/workflows/from-blueprint/route.ts` |

## 3. Keputusan yang harus diambil dulu

Karena workflow builder mengompilasi ke n8n dan berjalan di n8n, "MCP di builder" bisa berarti tiga hal berbeda. Pilih dulu sebelum menulis kode.

**Opsi A. Agent Aivory memanggil workflow n8n user sebagai tools.** Memakai infrastruktur tenant MCP yang sudah ada. Selaras dengan ide tool `trigger_*` di CERVEAU-N8N-ORCHESTRATION-PLAN. Paling murah dan paling jelas nilainya.

**Opsi B. Node di builder yang dikompilasi ke node MCP Client Tool milik n8n.** Bukan koneksi n8n ke Aivory, tapi workflow yang di dalamnya memanggil server MCP lain. Ini fitur berbeda, jangan dicampur dengan permintaan ini.

**Opsi C. Aivory membuat atau mengedit workflow di n8n user lewat `n8n-mcp`.** Fungsinya sama dengan REST API yang sudah dipakai sekarang, jadi nilai tambahnya kecil. Tunda.

Keputusan (2026-11-22): gabung A dan C. B tidak dikerjakan.

Dua opsi ini beda arah dan beda sisi server, jadi dikerjakan sebagai dua jalur dalam satu koneksi n8n:

| | A. Panggil workflow | C. Bangun workflow |
|---|---|---|
| Arah | Agent Aivory menjalankan workflow user | Aivory membuat dan mengedit workflow di n8n user |
| Server MCP | Milik n8n user (MCP bawaan n8n), URL + token dari user | `n8n-mcp` (community), dijalankan oleh Aivory, memakai instance URL + API key user |
| Kemampuan | Daftar workflow ter-expose, jalankan, ambil hasil | Cari node, ambil schema, validasi, buat dan ubah workflow |
| Risiko utama | SSRF ke URL buatan user | Aksi tulis di instance user, API key berhak penuh |
| Fase | 1 | 2 |

Urutan: A dulu, karena memakai infrastruktur tenant MCP yang sudah ada dan risikonya lebih kecil. C menyusul sebagai fase 2 dan memakai halaman koneksi dan gate tier yang sama dari fase 1.

## 4. Fase 1 (Opsi A)

### 4.1 Backend (avry-backend)
1. Pastikan `tenant-mcp-servers` menerima server MCP n8n: transport `streamable-http`, header auth berupa bearer token.
2. Pastikan guard SSRF memblokir IP privat, link-local, dan metadata cloud, termasuk setelah redirect dan DNS rebinding.
3. Koneksi per user (diputuskan 2026-11-22): satu koneksi n8n milik akun, tidak terikat satu `agent_type`. Backend perlu cara menyimpan koneksi tingkat user dan daftar agent yang boleh memakainya, plus tools yang aktif. Ini perubahan model data di repo backend, karena tenant MCP sekarang per `agent_type`. Perlu dicek besarnya di repo backend.
4. Simpan token terenkripsi lewat jalur yang sama dengan secret lain.

### 4.2 Frontend
1. Di halaman koneksi n8n, tambah pilihan "Sambungkan lewat MCP": field URL MCP dan token, tombol verifikasi.
2. Tampilkan hasil verifikasi: daftar workflow yang ter-expose sebagai tools, status, error yang bisa dipahami (versi n8n lama, workflow belum diaktifkan MCP, instance tidak terjangkau).
3. Pakai ulang komponen daftar tools dan toggle disable tool yang sudah ada.
4. Teks bantuan: cara mengaktifkan MCP di n8n dan meng-expose workflow tertentu.
5. Jangan hapus jalur URL + API key. Keduanya hidup berdampingan.

### 4.3 Runtime
1. Tools hasil verifikasi tersedia untuk agent yang diberi izin.
2. Panggilan tool dicatat di log aktivitas agent yang sudah ada.
3. Batasi timeout dan ukuran respons.

### 4.4 Tier
Keputusan (2026-11-22): koneksi MCP n8n hanya untuk tier berbayar. Akun gratis tidak bisa memakai MCP, dan workflow builder memang hanya untuk tier berbayar. Gate-nya sama dengan gate workflow builder, tidak ada gate baru.

Dampak:
- Frontend: pakai `isPaidTier` dari `lib/tiers.ts`, bukan daftar tier baru. Akun gratis tidak melihat opsi "Sambungkan lewat MCP".
- Backend wajib menegakkan gate yang sama. Menyembunyikan UI saja tidak cukup, karena endpoint bisa dipanggil langsung.
- Tenant MCP sekarang dibatasi Pro/Enterprise di backend. Perlu pengecualian untuk server bertipe n8n agar tier berbayar lain (operational, business) ikut bisa. Server MCP kustom lain tetap Pro/Enterprise.
- Permukaan abuse lebih kecil karena akun gratis tidak punya akses. Rate limit verifikasi, batas jumlah koneksi per user, timeout, dan batas ukuran respons tetap dipasang.
- Pemakaian tools oleh agent tetap mengikuti kuota agent tiap tier. Gate ini hanya untuk koneksi.
- Diputuskan: akun dengan grant `snapshot` dan `blueprint` (ada di `PAID_TIERS`) juga boleh memakai MCP. Alasannya: blueprint berisi workflow, jadi pemilik blueprint memang perlu menyambungkan n8n supaya workflow itu bisa dijalankan dan dikelola. Memakai `isPaidTier` apa adanya sudah mencakup mereka, tidak perlu pengecualian di kode.
- Catatan untuk grant sekali bayar: karena aksesnya tidak berulang, kuota koneksi dan rate limit tetap berlaku sama seperti tier lain.

## 4b. Fase 2 (Opsi C): bangun workflow lewat `n8n-mcp`

Alasan C tidak dikerjakan duluan: Aivory sudah bisa membuat dan mengaktifkan workflow lewat REST API. Nilai tambah `n8n-mcp` ada di tools penunjangnya (cari node, schema node, validasi sebelum deploy, template), yang membuat workflow hasil generate lebih sering valid. Kode kita sudah memakainya secara internal untuk validasi schema di `from-blueprint`.

### 4b.1 Keputusan arsitektur
1. Di mana `n8n-mcp` berjalan: satu layanan milik Aivory yang menerima kredensial n8n user per request (tidak menyimpannya), atau satu proses per user. Rekomendasi: satu layanan bersama, kredensial dikirim per panggilan dan diambil dari `dashboard.n8n_credentials` di server.
2. Jalur ini memakai instance URL + API key yang sudah tersimpan, jadi user tidak perlu mengisi apa pun lagi. Tidak ada URL MCP baru dari user, sehingga SSRF tidak bertambah selain yang sudah ada di jalur REST.
3. Pakai versi `n8n-mcp` yang di-pin dan jalankan di lingkungan terisolasi. Ini kode pihak ketiga yang menerima API key user.

### 4b.2 Pengaman aksi tulis
1. Default hanya tools baca dan validasi. Tools yang mengubah atau menghapus workflow butuh persetujuan user di UI per aksi.
2. Hapus workflow tidak dibuka di fase 2.
3. Setiap aksi tulis dicatat: workflow mana, siapa, kapan, diff ringkas.
4. Perubahan pada workflow yang sudah aktif dibuat sebagai draft atau salinan dulu, bukan menimpa.

### 4b.3 Integrasi di workflow builder
1. Copilot builder dan jalur console memakai tools C untuk mencari node dan memvalidasi sebelum men-deploy. Gate: credit (bagian 4d), bukan tier.
2. Tampilkan hasil validasi dan perbaikan otomatis di panel copilot yang ada.
3. Fallback ke jalur REST + validasi internal sekarang bila layanan `n8n-mcp` tidak tersedia.

## 4c. Hasil cek backend (2026-11-22, `backend/avry-backend`, `app/routes/tenant_mcp_servers.py`, `app/services/guarded_fetch.py`, `app/services/tiers.py`)

Koreksi dan temuan. Beberapa asumsi di bagian lain dokumen ini perlu dibaca dengan catatan ini.

1. **Gate tier backend adalah `operational` ke atas, bukan Pro/Enterprise.** Tulisan "Pro/Enterprise" di komentar `lib/tenantMcpServers.ts` sudah usang. Operational, Business, dan Enterprise sudah lolos. Tidak perlu pengecualian tier untuk server n8n.
2. **Pemilik grant `snapshot` dan `blueprint` DITOLAK backend.** Di backend, pembeli sekali bayar dianggap "tanpa plan aktif", jadi `account_tier` mengembalikan `free`, dan `_MIN_TIER = "operational"` menolak mereka. Keputusan "blueprint boleh pakai MCP" bertentangan dengan perilaku ini. Menjalankannya berarti menambah pengecualian sengaja di backend, bukan hanya `isPaidTier` di frontend. Perlu diputuskan ulang, lihat pertanyaan terbuka.
3. **Guard SSRF kuat.** `guarded_fetch` memvalidasi semua alamat hasil resolve DNS (loopback, privat, link-local termasuk 169.254.169.254), mem-pin IP yang sudah divalidasi untuk koneksi (menutup DNS rebinding), memvalidasi ulang setiap redirect (maksimal 3), membatasi respons 256 KB, dan memakai timeout connect 3 detik serta total 10 detik. Pertanyaan SSRF untuk jalur verifikasi terjawab.
4. **Batasan yang tetap ada:** URL wajib `https://`. n8n self-hosted tanpa TLS atau di jaringan privat tidak bisa terhubung. Ini sama seperti jalur REST sekarang.
5. **Belum terjawab: guard saat runtime.** Guard di atas terbukti untuk verifikasi di backend. Pemanggilan tool saat agent berjalan dilakukan runtime Cerveau (`mcp_transport.rs`), yang tidak ada di repo yang gue cek. Perlu dipastikan runtime itu juga memakai pengecekan yang setara, atau mengambil tool list dari backend.
6. **Model data:** tabel `tenant_custom_mcp_servers` berkunci `(user_id, agent_type, name)`, kuota per `(user_id, agent_type)` (operational 1, business 3, enterprise 10), dan pendaftaran mensyaratkan agent berjalan di Aivory Cerveau. Koneksi per user berarti kolom baru atau tabel baru untuk koneksi tingkat user plus tabel izin agent, dan mengubah sumber kuota. Ini perubahan berukuran sedang, bukan sekadar menambah route.
7. **Secret:** enkripsi header auth sudah ada (`mcp_server_encryption`) dan sudah dirancang sejalan dengan enkripsi kredensial n8n di dashboard. Bisa dipakai ulang.
8. **Hanya satu pengecualian jenis `risk_tier`:** kolom `risk_tier` (`safe`, `reversible`, `irreversible`) sudah ada per server. Berguna untuk Opsi A: tool yang menjalankan workflow n8n sebaiknya bertanda `reversible`, bukan `safe`, supaya mengikuti gerbang persetujuan yang ada.

## 4d. Gate akses: berdasarkan credit, bukan tier (keputusan 2026-11-22)

Menggantikan aturan tier di bagian 4.4 dan butir 2 di bagian 4c. Alasan: backend sudah memperlakukan credit sebagai penentu pemakaian fitur agent ("credits pay for agent turns, which are a paid feature", `credit_service.py`), dan pembeli sekali bayar tidak punya plan tapi bisa punya credit.

### Aturan
- Boleh memakai koneksi MCP n8n: akun dengan credit yang bisa dipakai (`monthly_balance + extra_balance > 0`), atau superadmin (unlimited).
- Tidak boleh: akun gratis tanpa credit sama sekali.
- Pembeli `snapshot` atau `blueprint` ikut boleh kalau punya credit (misalnya dari top-up atau grant), tanpa pengecualian khusus tier. Masalah di butir 2 bagian 4c hilang, karena gate-nya tidak lagi membaca nama tier.

### Dampak teknis
1. Backend: ganti `_require_paid_tier` di jalur n8n dengan pengecekan credit lewat `credit_service.get_status` (field `unlimited` atau `balance > 0`). Server MCP kustom non-n8n tetap memakai `_MIN_TIER`, kecuali diputuskan lain.
2. Runtime: pemanggilan tool oleh agent sudah memotong credit per turn, jadi saat credit habis agent berhenti sendiri. Koneksi yang sudah tersimpan tidak perlu dihapus; tools-nya tidak jalan sampai credit ada lagi.
3. Kuota jumlah koneksi: sekarang per tier (operational 1, business 3, enterprise 10). Akun tanpa plan tapi berkredit tidak punya tier, jadi perlu nilai bawaan 1. Untuk koneksi per user (bagian 4.1.3), kuota dihitung per user, bukan per `(user_id, agent_type)`.
4. Frontend: `isPaidTier` tidak lagi menjadi gate untuk opsi MCP. Pakai status credit dari endpoint credit yang sudah ada. Opsi MCP tampil kalau saldo bisa dipakai, dan untuk akun tanpa credit tampilkan ajakan top-up atau upgrade.
5. Kuota rate limit verifikasi dan batas respons tidak berubah.

### Hal yang perlu diperhatikan
- **Opsi C juga memakai gate credit** (diputuskan 2026-11-22), sama dengan A. Satu aturan untuk seluruh koneksi n8n lewat MCP. Alasan: tools C dipakai bersama LLM (copilot atau console) yang sudah memotong credit per turn, jadi credit memang ukuran biaya yang tepat.
- **Konsekuensi ke workflow builder.** Builder (UI) tetap hanya untuk tier berbayar. Akun yang hanya punya top-up bisa menyambungkan n8n lewat MCP, tapi tidak membuka builder. Untuk A itu wajar. Untuk C artinya tools bangun-workflow hanya bisa dicapai lewat jalur selain builder UI (misalnya console, seperti `app/api/console/workflows/from-blueprint`), selama builder UI tetap tier berbayar. Jangan menambah pintu masuk baru ke C hanya demi akun tanpa plan; cukup pastikan jalur console yang ada memakai gate credit yang sama.
- **Abuse oleh akun gratis yang membeli top-up kecil.** Mereka bisa memicu verifikasi ke URL buatan sendiri. Guard SSRF sudah kuat (bagian 4c.3), jadi risikonya terkendali, tapi rate limit verifikasi per user tetap wajib.
- **Credit habis di tengah workflow.** Perlu perilaku jelas: tool gagal dengan pesan "credit habis", bukan error teknis.

## 5. Risiko

| Risiko | Mitigasi |
|---|---|
| SSRF lewat URL buatan user | Guard di backend (4.1.2) dan tes untuk IP privat, redirect, DNS rebinding |
| Instance di balik firewall atau localhost | Pesan error jelas. MCP tidak menyelesaikan ini, sama seperti URL sekarang |
| User di n8n versi lama tanpa MCP | Deteksi saat verifikasi, arahkan ke jalur URL + API key |
| Workflow belum di-expose, tools kosong | Teks bantuan dan empty state yang menjelaskan langkahnya |
| Token bocor | Enkripsi, jangan pernah dikirim balik ke browser, tampilkan hanya status terhubung |
| Dua jalur koneksi membingungkan | Satu halaman, penjelasan singkat kapan memakai yang mana |
| API key n8n berhak penuh, `n8n-mcp` bisa mengubah atau merusak workflow user | Tools tulis butuh persetujuan per aksi, tanpa hapus, draft dulu, log audit (4b.2) |
| `n8n-mcp` adalah kode pihak ketiga yang memegang API key user | Versi di-pin, isolasi proses, kredensial per request dan tidak disimpan di layanan, tinjau lisensi |
| Perubahan n8n-mcp merusak kompatibilitas | Fallback ke validasi internal dan REST (4b.3) |

## 6. Tes

- Unit: validasi URL dan penanganan error verifikasi.
- Integrasi: server MCP palsu yang meniru n8n (daftar tools, panggil tool, error 401, timeout).
- Keamanan: percobaan SSRF terhadap `127.0.0.1`, `169.254.169.254`, hostname yang me-resolve ke IP privat, dan redirect ke IP privat.
- Manual: instance n8n sungguhan dengan satu workflow ter-expose, dipanggil dari agent.

## 7. Pertanyaan terbuka

1. ~~Opsi A, B, atau C?~~ Diputuskan: A dan C, A dulu (bagian 3). Sisa: lisensi `n8n-mcp` untuk dipakai di layanan berbayar, dan di mana layanannya di-host.
2. ~~Koneksi level user atau per agent?~~ Diputuskan: per user (bagian 4.1). Sisa: seberapa besar perubahan model data di backend.
3. ~~Tier mana yang boleh?~~ Diputuskan: hanya tier berbayar, sama dengan workflow builder (bagian 4.4). Grant `snapshot` dan `blueprint` ikut (blueprint berisi workflow).
4. Versi n8n minimum yang didukung, dan apakah perlu mendukung n8n cloud dan self-hosted sekaligus?
5. Apakah guard SSRF di backend sudah mencakup redirect dan DNS rebinding? Perlu dicek di repo backend, tidak ada di repo ini.

## 8. Urutan kerja

1. Putuskan pertanyaan 1 sampai 3.
2. Cek guard SSRF dan dukungan bearer token di backend (pertanyaan 5).
3. Backend: penyesuaian kecil bila perlu.
4. Frontend: UI koneksi MCP dan hasil verifikasi.
5. Tes dan uji manual dengan instance n8n sungguhan. Fase 1 selesai di sini.
6. Fase 2: putuskan hosting dan lisensi `n8n-mcp` (4b.1), bangun layanan terisolasi, pasang pengaman aksi tulis (4b.2), lalu sambungkan ke copilot builder (4b.3).

## 9. Rincian tugas

Ukuran: S = setengah hari atau kurang, M = 1 sampai 2 hari, L = 3 hari atau lebih. Ini perkiraan kasar dari membaca kode, bukan komitmen. Repo: **BE** = `backend/avry-backend`, **FE** = `frontend/avry-user-dashboard`, **RT** = runtime Cerveau (repo belum dicek).

### Fase 0. Penentu sebelum menulis kode
| # | Tugas | Repo | Ukuran |
|---|---|---|---|
| 0.1 | Cek runtime Cerveau (`mcp_transport.rs`): apakah pemanggilan tool saat agent berjalan memakai pengecekan SSRF yang setara dengan `guarded_fetch`, atau mengambil dari backend | RT | S |
| 0.2 | Cek MCP bawaan n8n: versi minimum, cara mengaktifkan, format auth, apakah mendukung streamable-http, dan bagaimana workflow di-expose. Uji dengan satu instance n8n sungguhan | n8n | S |
| 0.3 | Putuskan bentuk data koneksi per user (satu tabel baru, lihat 1.1) dan sumber kuota | BE | S |

Fase 1 tidak dimulai sebelum 0.1 dan 0.2 selesai. Kalau 0.2 menunjukkan MCP bawaan n8n tidak cukup stabil, rencana A perlu ditinjau ulang.

### Fase 1. Opsi A: agent memanggil workflow n8n
**Backend**
| # | Tugas | Ukuran |
|---|---|---|
| 1.1 | Skema baru: tabel koneksi tingkat user (url, transport, nama header auth, nilai terenkripsi lewat `mcp_server_encryption`, status verifikasi, daftar tools, tools yang dimatikan, `risk_tier`) dan tabel izin agent (koneksi x `agent_type`). Migrasi di `migrations/` | M |
| 1.2 | Route koneksi n8n: buat, daftar, verifikasi ulang, ganti token, matikan tools, hapus. Verifikasi memakai `_run_verification` dan `guarded_fetch` yang sudah ada | M |
| 1.3 | Gate credit: fungsi `require_usable_credits(user_id)` memakai `credit_service.get_status` (`unlimited` atau `balance > 0`). Dipakai oleh route 1.2, bukan `_require_paid_tier` | S |
| 1.4 | Kuota koneksi per user dengan nilai bawaan 1 untuk akun tanpa plan, 1/3/10 menurut tier bila ada | S |
| 1.5 | Rate limit verifikasi per user dan batas jumlah verifikasi gagal berturut-turut | S |
| 1.6 | Endpoint internal untuk runtime: ambil koneksi n8n milik user beserta agent yang diizinkan, mengikuti pola `GET .../internal/{user_id}/{agent_type}` yang sudah ada | M |
| 1.7 | Tandai tools workflow n8n dengan `risk_tier = reversible` agar mengikuti gerbang persetujuan | S |
| 1.8 | Tes: gate credit (free tanpa credit ditolak, top-up diterima, superadmin lolos), SSRF (127.0.0.1, 169.254.169.254, hostname ke IP privat, redirect ke IP privat), kuota, token tidak pernah muncul di respons | M |

**Runtime Cerveau**
| # | Tugas | Ukuran |
|---|---|---|
| 1.9 | Muat koneksi tingkat user dari 1.6 selain server per `agent_type`, gabungkan ke daftar tools agent yang diizinkan | M sampai L (tergantung 0.1) |
| 1.10 | Pesan galat jelas saat credit habis atau koneksi gagal verifikasi, bukan galat teknis | S |

**Frontend**
| # | Tugas | Ukuran |
|---|---|---|
| 1.11 | `lib/n8nMcpConnection.ts`: klien untuk route 1.2, mengikuti pola `lib/tenantMcpServers.ts` (kelas galat, penanganan 422 dengan baris tersimpan) | S |
| 1.12 | Hook gate credit dari `getCredits` (`lib/agentProfiles.ts`) dan `useCreditStatus` yang sudah ada; sembunyikan opsi MCP untuk akun tanpa credit dengan ajakan top-up | S |
| 1.13 | Opsi "Sambungkan lewat MCP" di samping form instance URL + API key (komponen koneksi n8n di `components/workflow/ActivationModal.tsx` dan `app/workflows/page.tsx`): field URL MCP dan token, tombol verifikasi | M |
| 1.14 | Panel hasil verifikasi: daftar workflow ter-expose, status, galat yang bisa dipahami (versi n8n lama, tools kosong, tidak terjangkau, bukan https) | M |
| 1.15 | Pemilih agent yang boleh memakai koneksi dan toggle tools, memakai ulang komponen daftar tools dan disable tool yang sudah ada | M |
| 1.16 | Teks bantuan: cara mengaktifkan MCP di n8n dan meng-expose workflow; penjelasan kapan memakai MCP dan kapan URL + API key | S |
| 1.17 | Tes komponen dan klien | S |

**Penutup fase 1**
| # | Tugas | Ukuran |
|---|---|---|
| 1.18 | Uji manual: instance n8n sungguhan, satu workflow ter-expose, dipanggil dari agent, credit berkurang, credit habis ditangani | S |
| 1.19 | Dokumentasi pengguna satu halaman | S |

Perkiraan total fase 1: sekitar 2 sampai 3 minggu satu orang, dengan ketidakpastian terbesar di 1.9 (bergantung hasil 0.1).

### Fase 2. Opsi C: bangun workflow lewat `n8n-mcp`
| # | Tugas | Repo | Ukuran |
|---|---|---|---|
| 2.1 | Putuskan hosting dan lisensi `n8n-mcp`; pin versi | keputusan | S |
| 2.2 | Layanan terisolasi untuk `n8n-mcp`, kredensial per request dari `dashboard.n8n_credentials`, tanpa menyimpan | BE/ops | L |
| 2.3 | Gate credit yang sama untuk semua panggilan C | BE | S |
| 2.4 | Pengaman aksi tulis: baca dan validasi default, persetujuan per aksi untuk ubah, tanpa hapus, draft bukan menimpa workflow aktif, log audit | BE + FE | L |
| 2.5 | Sambungkan ke copilot builder dan jalur console (`from-blueprint`), tampilkan hasil validasi di panel copilot | FE | M |
| 2.6 | Fallback ke validasi internal dan REST bila layanan mati | FE + BE | S |
| 2.7 | Tes keamanan dan uji manual | semua | M |

### Urutan dan ketergantungan
0.1, 0.2 -> 0.3 -> 1.1 -> (1.2, 1.3, 1.4, 1.5 paralel) -> 1.6 -> 1.9. Frontend (1.11 sampai 1.16) bisa mulai setelah kontrak route 1.2 disepakati, memakai server palsu. 1.18 terakhir. Fase 2 baru dimulai setelah fase 1 stabil.

### Yang tidak dikerjakan
- Opsi B (node builder ke MCP Client Tool n8n).
- Penghapusan workflow lewat C.
- Mengubah gate server MCP kustom non-n8n (tetap `_MIN_TIER`).

## 10. Hasil fase 0 (2026-11-22)

### 0.1 Runtime Cerveau: guard SSRF ada, dan perubahan runtime bisa nol
Sumber: `services/AVRY-Cerveau/crates/zeroclaw-tools/src/mcp_transport.rs`, `crates/zeroclaw-gateway/src/tenant.rs`.

- **Guard saat runtime ada.** Server yang berasal dari registrasi tenant (`guarded_transport`, hanya diset oleh `TenantCustomMcpResolver`) memakai klien terjaga: koneksi di-pin ke IP hasil resolve, tanpa redirect otomatis (`guarded_resolve::build_guarded_client`). Batas waktu: connect 3 detik, total 30 detik per panggilan. Pertanyaan SSRF untuk runtime terjawab.
- **Resolver sudah per `(user_id, agent_type)` dan mengambil dari backend.** Gateway memanggil `GET /api/v1/tenant-mcp-servers/internal/{user_id}/{agent_type}` dengan `X-Internal-Token`, lalu menyimpan hasilnya di cache (hit dan miss). Kegagalan backend diperlakukan sebagai "tidak ada server" untuk turn itu, bukan galat.
- **Implikasi besar untuk tugas 1.9:** runtime tidak perlu diubah. Cukup endpoint internal di backend (`internal_list_verified_servers`) menggabungkan koneksi n8n tingkat user ke daftar yang dikembalikan untuk agent yang diizinkan, dengan bentuk respons yang sama (`name, url, transport, auth_header_name, auth_header_value, risk_tier, disabled_tools`). Tugas 1.9 turun dari M sampai L menjadi S, dan pindah ke repo backend.
- **Catatan cache:** runtime menyimpan hasil di cache. Setelah user mengubah izin agent atau mematikan koneksi, perubahan baru terlihat saat cache kedaluwarsa. Periksa TTL cache di `tenant.rs` dan putuskan apakah perlu invalidasi eksplisit.
- **Jalur galat auth sudah ada:** 401/403 dari server memicu `.../auth-failure` sehingga status berubah ke `verification_failed`. Untuk koneksi tingkat user, endpoint ini perlu diarahkan ke tabel koneksi user, bukan ke `tenant_custom_mcp_servers`.

### 0.2 MCP bawaan n8n: ada, tapi lebih besar dari yang diasumsikan
Sumber: dokumentasi resmi n8n (halaman "Accessing n8n MCP server" dan tool reference), dibaca lewat subagent. Subagent hanya membaca sekitar 40 ribu karakter pertama dari referensi tools yang panjangnya sekitar 277 ribu karakter, jadi daftar tools di bawah belum lengkap. Perlakukan sebagai petunjuk yang masih harus diuji.

- **URL dan auth.** URL server diakhiri `/mcp-server/http`, diambil dari Settings > Instance-level MCP. Auth: OAuth (direkomendasikan) atau API key berupa token bearer personal yang terikat ke akun user, tampil sekali, dan token baru mencabut yang lama. Hanya owner atau admin instance yang bisa mengaktifkan MCP. Untuk koneksi dari Aivory, jalur yang cocok adalah bearer token karena sesuai dengan model header auth yang sudah ada.
- **Transport belum terkonfirmasi.** Dokumen tidak menyebut streamable-http atau SSE secara eksplisit. Path `/http` dan header `MCP-Protocol-Version` mengarah ke streamable-http, tapi itu kesimpulan, bukan fakta. Harus diuji dengan instance sungguhan.
- **Versi.** Tidak ada satu versi minimum. Fitur terbagi per versi: halaman Workflows enabled sejak 2.2.0, bangun dan ubah workflow sejak 2.13.0, read-only protection sejak 2.47.0. Perlu keputusan versi minimum yang didukung dan pesan galat untuk versi yang terlalu lama.
- **Tools.** Terbaca langsung: `search_workflows`, `get_workflow_details`, `execute_workflow`, `test_workflow`, `prepare_workflow_pin_data`, `publish_workflow`, `unpublish_workflow`. Dari ringkasan: `get_workflow_execution`, `search_workflow_executions`, `list_credentials`, `search_nodes`, `get_node_types`, `validate_workflow`, `create_workflow_from_code`, `update_workflow`, `restore_workflow_version`, dan puluhan lainnya. Jumlah tools banyak.
- **Per workflow harus diaktifkan** ("Available in MCP"). Pengecualian: `search_workflows` bisa menampilkan pratinjau workflow apa pun yang bisa dilihat user, tanpa memandang pengaturan itu.
- **`execute_workflow`** mengembalikan `executionId` langsung; hasilnya diambil dengan `get_workflow_execution`. Mode production mendukung trigger Webhook, Chat, Form, Schedule dan butuh versi yang sudah dipublikasikan. Form multi-langkah dan alur human-in-the-loop tidak didukung.
- **`test_workflow`** berjalan sinkron dengan timeout bawaan 300 detik, sedangkan klien terjaga Aivory membatasi 30 detik total. Tool ini akan selalu kena timeout untuk workflow yang lama.
- **Batas payload dan rate limit tidak disebut** di halaman yang terbaca.
- **Self-hosted:** MCP bisa dimatikan penuh dengan `N8N_DISABLED_MODULES=mcp`. Laporan komunitas menyebut reverse proxy yang menjatuhkan header `Authorization` sebagai masalah umum.

### Dampak ke rencana
1. **Opsi C bisa memakai koneksi yang sama.** n8n sendiri sudah mengekspos tools buat dan ubah workflow (sejak 2.13.0), termasuk `search_nodes`, `get_node_types`, `validate_workflow`, `create_workflow_from_code`, `update_workflow`. Artinya layanan terpisah untuk `n8n-mcp` komunitas (tugas 2.1, 2.2) mungkin tidak diperlukan, dan masalah hosting serta lisensi hilang. Syaratnya: versi n8n user minimal 2.13.0, dan fallback ke REST untuk versi lebih lama. Ini mengubah fase 2 secara mendasar; tinjau ulang sebelum fase 2 dimulai.
2. **Daftar izin tools wajib, bukan opsional.** Satu token bearer membuka tools tulis dan `list_credentials`, jadi koneksi A tanpa batasan memberi agent kemampuan mengubah, mempublikasikan, dan menonaktifkan workflow user. Default fase 1: hanya `search_workflows`, `get_workflow_details`, `execute_workflow`, `get_workflow_execution`, dan `search_workflow_executions` aktif. Semua tools lain masuk `disabled_tools` sejak koneksi dibuat (mekanisme `disabled_tools` sudah ada). Tools tulis baru dibuka di fase 2 dengan persetujuan per aksi.
3. **Token bearer terikat ke akun user di n8n**, jadi hak aksesnya sama dengan user itu. Sarankan user membuat akun atau proyek n8n khusus dengan hak terbatas untuk token Aivory, dan tulis ini di teks bantuan (tugas 1.16).
4. **Tool `risk_tier`:** `execute_workflow` tetap `reversible`. Tools tulis, kalau nanti dibuka, `irreversible`.
5. **`test_workflow` dimatikan** secara bawaan karena timeout 30 detik.
6. **Bentuk respons panjang:** respons dibatasi 256 KB di verifikasi. Daftar tools n8n yang besar bisa memenuhi konteks agent, jadi daftar izin di poin 2 juga menjaga konteks tetap kecil.

### 0.3 Bentuk data koneksi per user
Rekomendasi, mengikuti temuan 0.1:

- Tabel `product.user_n8n_mcp_connections`: `user_id` (kunci), `url`, `transport`, `auth_header_name`, `auth_header_value_encrypted`, `status`, `last_verified_at`, `last_verify_error`, `tools` (hasil verifikasi), `disabled_tools`, `risk_tier`, timestamp.
- Tabel `product.user_n8n_mcp_connection_agents`: `(user_id, agent_type)` untuk agent yang diizinkan.
- Jangan mengubah `tenant_custom_mcp_servers` (kunci dan kuotanya per agent). Endpoint internal yang ada menyisipkan baris sintetis dari tabel baru, sehingga runtime tidak berubah.
- Kuota: satu koneksi n8n per user. Kuota 1/3/10 per tier di tabel lama tidak dipakai di sini, jadi pertanyaan "nilai bawaan 1 untuk akun tanpa plan" hilang.

### Perubahan pada rincian tugas (bagian 9)
- **0.1 selesai.** **0.3 selesai** (bentuk data di atas). **0.2 sebagian selesai**: dokumentasi sudah dibaca, tapi transport dan versi harus diuji dengan satu instance n8n sungguhan sebelum fase 1.
- **1.1** memakai dua tabel baru di atas.
- **1.4** (kuota per tier) dihapus; digantikan satu koneksi per user.
- **1.6 dan 1.9** digabung: endpoint internal menggabungkan koneksi user ke respons yang ada. Ukuran S sampai M, tanpa perubahan di repo runtime.
- **Tambahan 1.20:** daftar izin tools bawaan (poin 2 dan 5), diterapkan saat verifikasi pertama. Ukuran S.
- **Tambahan 1.21:** periksa TTL cache resolver dan putuskan invalidasi saat izin agent berubah. Ukuran S.
- **Tambahan 1.22:** pesan galat untuk versi n8n lama, MCP dimatikan (`N8N_DISABLED_MODULES`), dan header `Authorization` terjatuh oleh proxy. Ukuran S.
- **Perkiraan fase 1 turun** ke sekitar 2 minggu satu orang, dengan syarat uji transport di 0.2 lolos.
- **Fase 2 perlu ditulis ulang** berdasarkan poin 1 di atas sebelum dikerjakan.

### 0.2 lanjutan: probe instance n8n.aivory.id (2026-11-22)
- Versi n8n di VPS: **2.26.4** (image `n8nio/n8n:latest`). Mencakup tools bangun dan ubah workflow (2.13.0), belum memuat fitur 2.33.0 ke atas (dialog "Connect a client" baru). Dialog token mungkin berbeda dari dokumentasi terbaru.
- `POST https://n8n.aivory.id/mcp-server/http` tanpa token mengembalikan **401 dengan `WWW-Authenticate: Bearer realm="n8n MCP Server"`**. Jadi modul MCP aktif, path lewat proxy dan tunnel dari luar, dan proxy tidak memblokir jalur ini. `N8N_DISABLED_MODULES` tidak diset di container.
- **Env di VPS tidak memuat token MCP.** `N8N_API_KEY` adalah kunci REST public API, bukan token akses MCP instance-level. `AUTH_TOKEN` di container n8n dan `N8N_MCP_AUTH_TOKEN` di compose adalah untuk server `n8n-mcp` komunitas, bukan untuk MCP bawaan n8n. Token MCP harus digenerate di UI n8n (Settings > Instance-level MCP).
- Belum diuji: transport (`initialize`, `tools/list`), daftar tools sebenarnya, `execute_workflow`. Menunggu token.
- Diuji: `N8N_API_KEY` dari env VPS dikirim sebagai bearer ke `/mcp-server/http` (hanya `initialize`, kunci tidak dicetak). Hasil: **401 Unauthorized**. Kunci REST public API (halaman Settings > n8n API) tidak berlaku untuk MCP; token MCP adalah jenis kredensial terpisah. Ini juga berarti dari sisi produk: user tidak bisa memakai API key n8n yang sudah mereka isi sekarang untuk jalur MCP, mereka perlu membuat token MCP terpisah (perlu dijelaskan di UI, tugas 1.16).

### 0.2 hasil uji dengan token MCP (2026-11-22, n8n 2.26.4 di n8n.aivory.id)
Dijalankan dari VPS, hanya panggilan baca. `execute_workflow` tidak diuji (tidak ada workflow uji; lima workflow yang ter-expose adalah workflow produksi).

| Hal yang diuji | Hasil |
|---|---|
| Transport | **Streamable-http.** `POST /mcp-server/http` dijawab 200, `Content-Type: text/event-stream` (isi berbingkai SSE `data: {...}`). Parser backend `_extract_jsonrpc_body` sudah menangani format ini |
| Sesi | **Tanpa `Mcp-Session-Id`.** Server tanpa status; handshake backend tetap kompatibel |
| `initialize` dengan `2024-11-05` (versi yang dipakai backend) | 200, dinegosiasikan ke `2024-11-05`. Versi tidak dikenal (`1999-01-01`) dinegosiasikan ke `2025-11-25`, tanpa galat |
| Server | `n8n MCP Server` 1.1.0, kapabilitas `tools` dan `resources` |
| Token salah | 401 `{"message":"Unauthorized"}` |
| Kunci REST (`N8N_API_KEY`) sebagai bearer | 401 (lihat catatan sebelumnya) |
| `tools/list` | 200, **28 tools, sekitar 62 KB.** Di bawah batas 256 KB verifikasi backend, tapi besar untuk konteks agent |
| `search_workflows` | 200, sekitar 12 KB untuk 10 hasil. Respons berisi `data[]` dengan field `id`, `name`, `active`, `availableInMCP` |

**Daftar tools sebenarnya (28):** `search_workflows`, `execute_workflow`, `get_execution`, `search_executions`, `get_workflow_details`, `publish_workflow`, `unpublish_workflow`, `prepare_test_pin_data`, `test_workflow`, `list_credentials`, `search_data_tables`, `create_data_table`, `rename_data_table`, `add_data_table_column`, `delete_data_table_column`, `rename_data_table_column`, `add_data_table_rows`, `search_nodes`, `get_node_types`, `get_workflow_best_practices`, `validate_workflow`, `validate_node_config`, `create_workflow_from_code`, `search_projects`, `search_folders`, `archive_workflow`, `update_workflow`, `get_sdk_reference`.

Koreksi terhadap dokumentasi: nama tools eksekusi di 2.26.4 adalah `get_execution` dan `search_executions` (bukan `get_workflow_execution` dan `search_workflow_executions`). Tools data table (`create_data_table`, `add_data_table_rows`, `delete_data_table_column`, dan lainnya) tidak tercantum di ringkasan dokumentasi dan bersifat tulis.

**Dampak ke rencana**
1. **Daftar izin default fase 1 diperbarui:** `search_workflows`, `get_workflow_details`, `execute_workflow`, `get_execution`, `search_executions`. Sisa 23 tools masuk `disabled_tools` saat verifikasi pertama. Tools berbahaya yang harus tetap mati: `list_credentials`, semua tools data table, `publish_workflow`, `unpublish_workflow`, `archive_workflow`, `update_workflow`, `create_workflow_from_code`.
2. **Jangan simpan daftar nama tetap.** Nama tools berbeda antar versi n8n. Daftar izin sebaiknya dicocokkan dengan nama hasil `tools/list`, dan tools baru yang tidak dikenal otomatis nonaktif (daftar putih, bukan daftar hitam).
3. **Filter `availableInMCP`.** `search_workflows` mengembalikan workflow yang tidak ter-expose juga. UI koneksi harus hanya menampilkan yang `availableInMCP: true`, dan jangan menganggap yang lain bisa dijalankan.
4. **Ukuran konteks.** 62 KB definisi tools per koneksi terlalu besar jika semua 28 dimuat. Dengan daftar izin lima tools, ukurannya turun jauh; ukur ulang setelah disaring.
5. **Handshake backend tidak perlu diubah** untuk jalur ini (`2024-11-05` diterima, SSE sudah diparse).
6. **Fase 2 (opsi C) layak dilanjutkan lewat MCP bawaan n8n:** tools `search_nodes`, `get_node_types`, `validate_workflow`, `validate_node_config`, `create_workflow_from_code`, `update_workflow`, `get_sdk_reference` semuanya ada di 2.26.4. Layanan `n8n-mcp` komunitas tidak diperlukan.
7. **Belum teruji:** `execute_workflow` dan `get_execution` (butuh workflow uji), perilaku timeout 30 detik pada workflow yang lambat, dan perilaku saat `N8N_DISABLED_MODULES=mcp` atau versi n8n lebih lama.

## 11. Status backend (2026-11-22)

Ditulis di worktree backend `backend/be-n8n-mcp`, branch `feat/n8n-mcp-connection` (belum di-commit): modul `app/routes/n8n_mcp_connection.py`, gabungan di endpoint internal `tenant_mcp_servers.py`, registrasi di `main.py`, dan `tests/test_n8n_mcp_connection.py`.

- Gate credit, daftar putih lima tools, rate limit verifikasi, token terenkripsi dan tidak pernah dikembalikan.
- **Guard instance Aivory:** non-superadmin tidak bisa menyambungkan host di `aivory.id`, `aivory.uk`, host dari env deployment (`N8N_URL`, `N8N_BASE_URL`, `N8N_EDITOR_BASE_URL`, `WEBHOOK_URL`, `N8N_WEBHOOK_URL`), atau daftar `N8N_MCP_BLOCKED_HOSTS`. Berlaku pada connect, ganti token, dan reverify. Superadmin tetap boleh untuk uji. Hanya mencocokkan nama host (label utuh, jadi `evil-aivory.id` tidak terblokir), bukan IP.
- Belum: uji ke Postgres sungguhan, commit, dan sisi frontend.
