# WhatsApp deploy per agent untuk Cerveau — rancangan

Status: backend (`avry-backend`: `app/services/whatsapp_service.py`, `app/routes/whatsapp.py`) dan dashboard (`lib/whatsappDeploy.ts`,
`lib/whatsappAgentForward.ts`, tab Deploy) sudah ditulis dan lulus tes, belum di-commit dan belum di-deploy. Belum ada alur
pembelian add-on (flag di-set lewat `PUT /api/v1/whatsapp/internal/addon`). Acuan pola: `avry-backend/app/routes/telegram.py`
dan `app/services/telegram_service.py`.

## Kondisi saat ini (dicek di VPS)
- WhatsApp sudah live lewat **Kapso** pada nomor milik Aivory, tapi hanya sebagai **fitur CRM** di dashboard:
  webhook `hook.aivory.uk/dashboard/api/whatsapp/webhook` (Traefik) → container `avry-user-dashboard`
  (`app/api/whatsapp/webhook/route.ts`, `lib/whatsappWebhook.ts`, `lib/kapso.ts`). Pesan masuk dicatat ke CRM;
  satu agent pilihan per tenant membuat draf balasan, atau membalas otomatis dalam mode autonomous.
- Env `KAPSO_*` (`API_KEY`, `PHONE_NUMBER_ID`, `WEBHOOK_SECRET`, `CRM_TENANT_ID`, `DISPLAY_PHONE`) sudah ada di `.env`
  dan blok `environment` `avry-backend` di `docker-compose.prod.yml`.
- `avry-backend` belum punya kode Kapso/WhatsApp untuk agent. Tab Deploy di `CustomizeAgentModal.tsx` hanya punya
  telegram, slack, discord, api; di `app/agents/page.tsx` WhatsApp masih ikon dengan label "Enterprise plan only".

Rancangan Cloud API langsung versi awal **tidak dipakai**: transport-nya Kapso.

## Keputusan yang sudah diambil
- **Transport:** Kapso, nomor Aivory bersama untuk semua tenant di fase 1. Nomor per tenant (Embedded Signup) ditunda.
- **Model deploy:** seperti Telegram. QR → `wa.me/<nomor>?text=LINK-xxxxxx` → user mengirim kode → binding
  `wa_id` ↔ agent → chat pribadi user langsung dengan agent.
- **Paket:** dibuka untuk semua tier sebagai **add-on berbayar** (bukan lagi Enterprise-only). Belum ada mekanisme
  add-on di dashboard; perlu flag hak akses per tenant (`whatsapp_addon`) dan produk berulang di `avry-payments`.
- **STT:** Groq `whisper-large-v3-turbo` lewat `transcribe_audio()` di `app/services/attachment_extractor.py`
  (backend `avry-backend`, commit `97f332a`, branch `feat/telegram-new-agent-bots`). Sudah live untuk Telegram.
  Ditolak: OpenAI gpt-4o-mini-transcribe (tidak ada kunci), OpenRouter (tidak punya endpoint transkripsi),
  faster-whisper self-host (CPU VPS lambat), Moonshine (tidak mendukung bahasa Indonesia).
- **Biaya LLM** sudah termasuk di harga tier, jadi tidak dihitung di add-on.

## Arsitektur
Webhook Kapso mendarat di dashboard, sedangkan Cerveau ada di backend. Jadi:
1. Dashboard memverifikasi signature (sudah ada) lalu meneruskan pesan ke backend
   `POST /api/v1/whatsapp/inbound` (endpoint internal, dilindungi secret internal seperti internal agent turn).
2. Backend: kode `LINK-xxxxxx` → buat binding; `wa_id` yang sudah terikat → `_route_to_agent(..., channel="whatsapp")`
   → balas lewat Kapso; dedupe berdasarkan message id (TTL 48 jam).
3. `wa_id` tidak terikat → backend membalas `not_handled`, dashboard lanjut ke alur CRM seperti sekarang.
4. Webhook harus ack cepat (provider menunggu ±10 detik, satu turn Cerveau bisa sampai 195 detik): proses di
   background, lalu kirim balasan lewat Kapso.

### Kontrak API untuk frontend
| Endpoint | Fungsi |
|---|---|
| `POST /api/v1/whatsapp/deploy-link` `{agent_type}` (JWT) | → `{token, deep_link, agent_type, agent_name, expires_at}`; token 6–8 karakter. 402 kalau add-on belum aktif |
| `GET /api/v1/whatsapp/link-status/{token}` | → `pending` / `connected` / `expired` / `not_found` |
| daftar + `DELETE` binding | Supaya `listDeployments()` menampilkan kind `whatsapp` |
| `POST /api/v1/whatsapp/inbound` (internal) | Dari webhook dashboard; lihat di atas |

### Model data (backend)
Disimpan di koleksi JSON seperti Telegram (`save_json`), jadi tidak ada migrasi SQL.
- `whatsapp_bindings`: `binding_id`, `user_id`, `agent_type`, `team_id`, `wa_id`, `last_inbound_at`, `created_at`.
  `chat_id` diisi `wa_id` agar kontrak ke gateway tidak berubah.
- `whatsapp_link_tokens`: `token`, `user_id`, `agent_type`, `expires_at`, `used`.
- `whatsapp_processed_messages`: dedupe, TTL 48 jam.
- Hak akses add-on: flag `whatsapp_addon` (aktif, tanggal berakhir) per tenant.

## Perbedaan penting dari Telegram
| Hal | Telegram | WhatsApp | Konsekuensi |
|---|---|---|---|
| Kirim kapan saja | bebas | hanya dalam 24 jam sejak pesan user terakhir | Di luar window wajib **template message** yang sudah di-approve Meta |
| Reminder / scheduled run | kirim langsung | kena aturan window | `send()` cek `last_inbound_at`: dalam window → teks; di luar → template `agent_followup` |
| Approval | inline keyboard | tombol balasan (maks 3, label ≤ 20 karakter) | Varian WA; `parse_approval_text` tetap sebagai fallback ketik |
| Panjang pesan | 4096 | 4096 teks, 1024 body tombol | Pecah pesan panjang |
| Typing indicator | ada | tidak ada yang andal | Kirim ack singkat kalau turn > ~8 dtk |
| Grup | didukung | tidak didukung | Hanya chat 1:1 |
| Format teks | HTML/Markdown | `*bold*`, `_italic_`, tanpa tabel | Konversi markdown → format WA |

## Fase
1. **Backend:** tabel + endpoint di atas, binding lewat kode, teks masuk/keluar lewat Kapso, dedupe, cek add-on.
2. **Dashboard:** `lib/whatsappDeploy.ts`, tampilan QR di tab Deploy, kind `whatsapp` di `lib/agentChat.ts` dan
   `app/agents/page.tsx`, ganti label "Enterprise plan only" dengan status add-on, teruskan webhook ke backend.
3. **Add-on:** produk berulang di `avry-payments`, flag hak akses, tombol "Aktifkan add-on".
4. **Media dan approval:** approval via tombol + fallback ketik; gambar, dokumen, voice note.
   - STT sudah selesai untuk Telegram; tinggal tersambung ke media WhatsApp.
   - `GROQ_API_KEY` sudah ada di container backend (`/home/ubuntu/AVRY-V2-Main/.env` dan blok `environment`
     `avry-backend`), jadi tidak ada langkah env/compose baru.
5. **Template:** `agent_followup` untuk reminder/scheduled run; cek window di `send()`.
6. **Nomor per tenant** (Embedded Signup), kalau dibutuhkan.

## Estimasi biaya (tanpa LLM)
Asumsi: 20 template per tenant per bulan, tarif Meta Indonesia sekitar $0,02 per template (belum terverifikasi,
sumber saling bertentangan). Balasan dalam 24 jam gratis. Tarif Kapso: Free 2.000 pesan; Pro $25/bulan, 100.000 pesan
(masuk + keluar), 3 nomor, nomor tambahan $10; Platform $299/bulan, 1.000.000 pesan, 50 nomor, nomor tambahan $5.

| Model | 10 tenant | 50 tenant | 100 tenant |
|---|---|---|---|
| Nomor bersama (Kapso Pro) | $29 (±$2,9/tenant) | $45 (±$0,9) | ±$65 (±$0,65) |
| Nomor per tenant, Pro | $95 (±$9,5) | $495 (±$9,9) | $995 (±$10) |
| Nomor per tenant, Platform | $299 (±$30) | $299 (±$6) | $549 (±$5,5) |

Template menambah ±$0,40 per tenant di semua baris. Titik impas Pro vs Platform ±31 tenant.
Usulan add-on: nomor bersama sekitar $5–7/bulan; nomor per tenant sekitar $15–20/bulan. Harga final belum diputuskan.

## Risiko / pertanyaan terbuka
- Review Meta untuk template butuh beberapa hari; ajukan `agent_followup` sejak fase 1.
- Tarif template Meta Indonesia terbaru, dan apakah utility dalam window gratis (sumber bertentangan). Cek rate card resmi.
- Apakah Embedded Signup hanya ada di Kapso Platform, dan apakah biaya kelola 5% atas tagihan Meta berlaku.
- Model harga add-on (per tenant atau per nomor/agent) dan apakah ada kuota giliran agent.
- Voice note: bukan pertanyaan terbuka lagi. `transcribe_audio()` dipakai ulang apa adanya; yang baru hanya unduh
  media dari Kapso/Graph API. WhatsApp mengirim voice note sebagai `audio/ogg; codecs=opus`, yang diterima Groq.
  Batas durasi/ukuran (10 menit, 20 MB) sudah ada di fungsi itu. Audio sunyi bisa menghasilkan teks halusinasi
  pendek seperti "Thank you." (terlihat di tes).
- Pesan masuk dari nomor yang sudah terikat tidak boleh ikut tercatat/di-draft oleh alur CRM; urutan
  penerusan webhook harus jelas.
- Privasi: pesan lewat Meta dan Kapso, jadi perlu masuk ke teks kebijakan privasi.
