# Agent WhatsApp kirim pesan ke kontak lain — rancangan

Status: rancangan, belum ada kode. Dibuat 2026-11-22 setelah riset kode dan kebijakan Meta. Pelengkap
`docs/whatsapp-adapter-design.md` (adapter Kapso yang sudah live).

## Masalah
Agent yang di-deploy ke WhatsApp lewat Kapso hanya bisa membalas ke nomor yang sudah di-bind (nomor pemilik).
Perintah seperti "ini nomor Samuel, kirim pesan B A C D" tidak bisa dijalankan, dan agent bisa saja mengaku sudah
terkirim padahal tidak.

## Temuan riset (dasar rancangan)
**Kode (dicek 2026-11-22)**
- Backend `avry-backend/app/services/whatsapp_service.py`: semua pemanggil `send_text` mengirim ke
  `binding["wa_id"]` atau pengirim pesan masuk. Tidak ada tool agent dengan parameter nomor tujuan.
- Cerveau (`services/AVRY-Cerveau`): tool `send_via` hanya mengambil penerima dari config peer group
  (`external_peers`) dan gagal tertutup bila penerima kosong. Tidak ada tool kirim WhatsApp bawaan.
- Cerveau `http_request` aktif secara default dengan `allowed_domains = ["*"]`. Kunci Kapso tidak ada di container
  Cerveau (hanya backend dan dashboard), jadi agent tidak bisa memanggil API Kapso/Meta sendiri. Config produksi
  di VPS **belum dicek**.
- Sudah ada: sistem pending-approval gateway (`agent_approvals.py`), tombol approval WhatsApp,
  `kapsoSendTemplate`/`kapsoListTemplates` di `lib/kapso.ts`, scope tool per agent (`agent_tool_scope.py`).

**Meta**
- Pesan yang dimulai bisnis di luar window 24 jam wajib pakai template yang sudah di-approve, dan wajib ada
  opt-in penerima. Opt-in sebaiknya per kategori pesan.
- Template utilitas harus non-promosi; campuran promosi otomatis dihitung marketing.
- Penerima bisa mematikan pesan marketing; request tetap diterima API tapi pesan tidak dikirim.
- Limit awal sekitar 250 penerima unik per 24 jam (sumber pihak ketiga ada yang menyebut 1.000), berlaku di level
  Business Portfolio. Rating kualitas turun bila banyak blokir/laporan; Low selama 7 hari menurunkan tier.
- Tarif Indonesia (IDR, per pesan terkirim): marketing Rp586,33; utilitas Rp356,65; autentikasi Rp356,65;
  layanan Rp356,65 (1.000 pertama per nomor per bulan gratis). Sumber: halaman harga dan dokumentasi pricing Meta.

## Tujuan dan non-tujuan
Tujuan: agent bisa mengirim pesan ke kontak yang **sudah dikenal dan sudah setuju**, dengan persetujuan manusia,
tanpa membahayakan nomor Aivory bersama.

Bukan tujuan (fase ini): broadcast/kampanye massal, pesan marketing, menerima balasan kontak dan merutekannya ke
agent (balasan kontak tetap masuk ke alur CRM yang ada), grup.

## Rancangan

### Prinsip
1. **Model tidak pernah memilih nomor mentah.** Tool menerima `contact_id`; nomor hanya ada di tabel kontak.
2. **Tidak ada kirim langsung.** Tool hanya membuat draf; pengiriman terjadi setelah approval manusia.
3. **Kunci Kapso tetap di backend.** Cerveau tidak pernah memegangnya.
4. **Gagal tertutup**, mengikuti pola `send_via`.

### Data (backend, koleksi JSON seperti binding)
`whatsapp_contacts`: `contact_id`, `user_id`/`team_id`, `name`, `wa_id` (ternormalisasi), `opt_in` {`source`,
`attested_by`, `at`}, `opted_out` (bool), `last_inbound_at`, `created_at`.
`whatsapp_outbound_log`: `id`, `user_id`, `agent_type`, `contact_id`, `kind` (text/template), `template`, `status`,
`approved_by`, `approved_at`, `created_at`, `error`. Tanpa isi pesan penuh bila tidak perlu (privasi).

### Menambah kontak
- Dari dashboard (tab Deploy/CRM): isi nama + nomor + centang pernyataan "orang ini setuju menerima pesan dari agent".
  Kontak CRM yang sudah pernah chat ke nomor Aivory otomatis tercatat dengan `last_inbound_at` (window terbuka).
- Dari chat: bila pemilik bilang "ini nomor Samuel", agent memanggil `whatsapp_propose_contact(name, number)`.
  Ini **hanya membuat permintaan approval**; kontak baru aktif setelah pemilik menyetujui dan menegaskan opt-in.
  Nomor mentah dari chat tidak pernah langsung bisa dikirimi.
- Kontak yang membalas "STOP"/"BERHENTI" otomatis `opted_out = true`.

### Tool agent (di Cerveau)
- `whatsapp_list_contacts()` → nama + `contact_id` + status window (tanpa nomor lengkap).
- `whatsapp_propose_contact(name, number)` → membuat approval penambahan kontak.
- `whatsapp_send_to_contact(contact_id, message)` → membuat approval pengiriman (draf), mengembalikan "menunggu
  persetujuan", **bukan** "terkirim".
Default **mati** per agent; dinyalakan lewat scope tool (`agent_tool_scope`) dan hanya bila add-on aktif.

### Alur kirim
1. Agent memanggil `whatsapp_send_to_contact` → baris pending di gateway (`/webhook/approvals`).
2. Pemilik menerima kartu approval (dashboard dan/atau tombol WhatsApp di chat pribadinya) berisi nama kontak, isi
   pesan, dan estimasi biaya. Setuju / Tolak / Ubah.
3. Setelah setuju, backend memanggil `POST /api/v1/whatsapp/internal/outbound` (secret internal, seperti internal
   agent turn). Pemeriksaan berurutan, gagal di salah satu = berhenti dan dicatat:
   add-on aktif → tool aktif untuk agent → kontak ada dan `opt_in` ada → `opted_out` false → rate limit →
   kill switch/kualitas nomor → pilih jalur.
4. Jalur: window terbuka (`last_inbound_at` < 24 jam) → `send_text`; window tertutup → template utilitas yang sudah
   di-approve Meta lewat `kapsoSendTemplate`; template tidak tersedia → tolak dengan pesan jelas ke pemilik.
5. Hasil (terkirim/gagal) dilaporkan balik ke pemilik di chat. Status dari webhook Kapso/Meta mengupdate log.

### Guardrail
- **Rate limit per tenant**: usulan awal 20 kontak unik/hari dan 100 pesan/hari per tenant, dapat diubah. Angka
  ini harus jauh di bawah limit 250 penerima unik/hari milik seluruh Business Portfolio.
- **Kuota global**: pencacah penerima unik harian seluruh tenant; berhenti di 60% limit tier berjalan.
- **Pemantau kualitas**: simpan event rating kualitas nomor dari webhook Meta/Kapso; bila turun ke Medium/Low,
  matikan pengiriman outbound semua tenant (kill switch) sampai pulih. Pesan balasan ke window terbuka tidak
  terpengaruh.
- **Audit log** untuk setiap pengiriman dan penolakan.
- **Blokir jalan memutar**: di Cerveau, `http_request` untuk agent tenant diberi `allowed_domains` yang tidak
  mencakup host Meta/Kapso, atau domain tersebut masuk daftar tolak. (Perlu dicek config produksi dulu.)
- **Penolakan jujur**: bila alur belum aktif, agent harus menjawab bahwa kemampuan itu belum tersedia, bukan
  mengaku sudah mengirim. Tambahkan ke prompt/identitas agent WhatsApp.

### Biaya
- Dalam window: pesan layanan Rp356,65 setelah jatah 1.000 gratis per nomor per bulan (jatah dipakai bersama
  seluruh tenant karena nomor bersama).
- Di luar window: template utilitas Rp356,65; bila terklasifikasi marketing Rp586,33.
- Approval card menampilkan estimasi biaya per kirim. Tagihan ke tenant belum diputuskan (lihat pertanyaan terbuka).
- Margin add-on $6 perlu dihitung ulang, lihat `whatsapp-adapter-design.md`.

## Fase
1. **Fondasi (backend):** tabel kontak dan log, endpoint `internal/outbound` dengan semua pemeriksaan, pencacah dan
   kill switch, deteksi STOP. Tes unit untuk setiap penolakan.
2. **Approval:** integrasi dengan pending-approval gateway, kartu approval dashboard dan tombol WhatsApp.
3. **Tool Cerveau:** tiga tool di atas, default mati, scope per agent, fail-closed. Tes bahwa model tidak bisa
   mengirim tanpa `contact_id` valid dan tanpa approval.
4. **Dashboard:** kelola kontak, pernyataan opt-in, log kirim, tombol kill switch.
5. **Template:** ajukan template utilitas ke Meta sejak fase 1 (butuh beberapa hari).
6. **Hardening:** blokir `http_request` ke host Meta/Kapso, alarm kualitas nomor.

## Risiko dan pertanyaan terbuka
- **Template dengan isi bebas hampir pasti ditolak/direklasifikasi Meta.** Template yang isinya hanya `{{1}}`
  biasanya ditolak. Perlu daftar kecil template bermakna (mis. pengingat janji, tindak lanjut pesanan) dan agent
  memilih template + mengisi variabel. Belum diuji; cek aturan review Meta dan Kapso.
- Opt-in hanya berupa pernyataan pemilik tenant. Secara kebijakan Meta ini tanggung jawab bisnis, tapi nomor Aivory
  yang kena imbas. Perlu syarat layanan dan teks kebijakan yang jelas. Tinjau dengan pihak hukum.
- Satu tenant bisa menurunkan kualitas nomor bersama untuk semua tenant. Mitigasi di atas membatasi, tapi nomor per
  tenant (Embedded Signup) tetap pilihan jangka menengah bila fitur ini laku.
- Apakah balasan kontak ke nomor Aivory diteruskan ke pemilik atau agent? Usulan fase 1: hanya dicatat di CRM dan
  notifikasi ke pemilik.
- Siapa menanggung biaya pesan: termasuk di add-on, kuota per bulan, atau tagihan terpisah.
- Config produksi Cerveau (`http_request`, toolkit Composio WhatsApp) belum diverifikasi di VPS.
- Batas awal Meta 250 vs 1.000 penerima unik/hari belum jelas; cek di Business Manager akun Aivory.
