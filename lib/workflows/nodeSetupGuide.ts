/**
 * Node Setup Guide Generator — deterministic, per-node documentation.
 * Maps each workflow step to curated setup instructions (credentials,
 * required fields, where to get them, test tips) and renders Markdown.
 */

export interface GuideStep {
  id?: string
  title?: string
  type?: string
  app?: string
  action?: string
  nodeType?: string
  description?: string
  config?: Record<string, unknown>
  parameters?: Record<string, unknown>
  branches?: { key: string; label?: string; steps: GuideStep[] }[]
}

interface NodeGuide {
  match: (step: GuideStep) => boolean
  purpose: string
  fields: [string, string][]
  credential?: string
  testTip: string
}

const has = (s: GuideStep, kw: string) =>
  `${s.app ?? ''} ${s.action ?? ''} ${s.nodeType ?? ''} ${s.title ?? ''} ${s.type ?? ''}`
    .toLowerCase()
    .includes(kw)

const NODE_GUIDES: NodeGuide[] = [
  {
    match: s => has(s, 'gmail') || (has(s, 'smtp') && !has(s, 'telegram')),
    purpose: 'Mengirim email keluar melalui Gmail / SMTP.',
    fields: [
      ['To', 'Email penerima (statik atau ekspresi, mis. {{$json.email}})'],
      ['Subject', 'Subjek email; boleh pakai ekspresi untuk personalisasi'],
      ['Email Format / Body', 'Isi pesan; pilih HTML jika perlu format'],
      ['From Name', 'Nama tampilan pengirim'],
    ],
    credential:
      'Gmail: buat OAuth2 di Google Cloud Console (aktifkan Gmail API, buat OAuth Client ID, set redirect URL ke n8n). Alternatif ringan: App Password 16-digit (aktifkan 2FA akun Google dulu) lalu pakai node SMTP dengan host smtp.gmail.com port 465 (SSL).',
    testTip: 'Kirim tes ke alamat sendiri; cek folder Spam pada run pertama.',
  },
  {
    match: s => has(s, 'slack'),
    purpose: 'Mengirim pesan/notifikasi ke channel atau user Slack.',
    fields: [
      ['Channel', 'Nama channel tujuan (mis. #sales) atau user ID'],
      ['Text', 'Isi pesan; dukung ekspresi {{$json.field}}'],
      ['Attachments/Blocks', 'Opsional, untuk pesan kaya format'],
    ],
    credential:
      'Buat Slack App di api.slack.com/apps → tambahkan scope chat:write (Bot Token Scopes) → install ke workspace → salin Bot User OAuth Token (xoxb-...) → invite bot ke channel target dengan /invite.',
    testTip: 'Pastikan bot sudah jadi member channel, kalau tidak pesan gagal dengan not_in_channel.',
  },
  {
    match: s => has(s, 'http') && (has(s, 'request') || has(s, 'post') || has(s, 'get') || has(s, 'call')),
    purpose: 'Memanggil API/endpoint HTTP eksternal.',
    fields: [
      ['Method', 'GET/POST/PUT/DELETE sesuai endpoint'],
      ['URL', 'Endpoint tujuan (https://...)'],
      ['Authentication', 'None / Basic / Header Auth / OAuth2 sesuai penyedia API'],
      ['Body (JSON)', 'Payload untuk POST/PUT; gunakan ekspresi untuk data dinamis'],
      ['Timeout', 'Disarankan 15-30 detik; hindari tanpa timeout'],
    ],
    credential:
      'Untuk API ber-token: buat credential Header Auth dengan Name=Authorization dan Value=Bearer <token> (atau X-API-Key sesuai provider).',
    testTip: 'Mulai dari GET sederhana untuk memastikan konektivitas sebelum menambah body.',
  },
  {
    match: s => has(s, 'webhook'),
    purpose: 'Menerima data masuk dari sistem eksternal via HTTP.',
    fields: [
      ['HTTP Method', 'POST untuk pengiriman data (default GET)'],
      ['Path', 'Jalur unik URL webhook, mis. lead-intake'],
      ['Respond', 'Immediately (default) / When Last Node Finishes bila pengirim butuh balasan'],
    ],
    credential: 'Tidak butuh credential. URL produksi tersedia setelah workflow aktif.',
    testTip: 'Uji dengan: curl -X POST <URL> -H "Content-Type: application/json" -d \'{"name":"Tes"}\'',
  },
  {
    match: s => has(s, 'schedule') || has(s, 'cron') || has(s, 'interval'),
    purpose: 'Menjalankan workflow pada jadwal berulang.',
    fields: [
      ['Trigger Interval', 'Seconds/Minutes/Hours/Days/Weeks/Custom (cron)'],
      ['Cron Expression (custom)', 'Format 5-field, mis. "0 8 * * 1-5" = 08:00 Sen-Jum'],
      ['Timezone', 'Set ke zona waktu bisnis (mis. Asia/Jakarta) di workflow settings'],
    ],
    credential: 'Tidak butuh credential.',
    testTip: 'Aktifkan workflow agar jadwal berjalan; Execute Workflow hanya untuk sekali jalan.',
  },
  {
    match: s => has(s, 'sheets') || has(s, 'spreadsheet'),
    purpose: 'Membaca/menulis Google Sheets.',
    fields: [
      ['Document', 'Pilih spreadsheet dari daftar (butuh akses OAuth)'],
      ['Sheet', 'Tab/worksheet tujuan'],
      ['Operation', 'Append (tambah baris) / Update / Read'],
      ['Columns', 'Mapping kolom; aktifkan auto-map dari input'],
    ],
    credential:
      'Google Sheets OAuth2: Google Cloud Console → aktifkan Sheets API → OAuth Client → masukkan Client ID/Secret ke credential n8n → Connect.',
    testTip: 'Append satu baris dummy lalu cek spreadsheet; kolom header harus sudah ada.',
  },
  {
    match: s => has(s, 'postgres') || has(s, 'mysql') || has(s, 'database') || has(s, 'mongo'),
    purpose: 'Operasi database (query, insert, update).',
    fields: [
      ['Operation', 'Execute Query / Insert / Update'],
      ['Query / Table', 'Query SQL atau tabel target'],
      ['Parameters', 'Gunakan query parameterized ($1, $2) — jangan string concat'],
    ],
    credential:
      'Buat credential DB (host, port, db, user, password). Untuk DB di server yang sama gunakan host.docker.internal atau IP internal, bukan localhost.',
    testTip: 'Mulai dengan SELECT 1 untuk memvalidasi koneksi sebelum query bisnis.',
  },
  {
    match: s => has(s, 'openai') || has(s, 'gpt') || has(s, 'agent') || has(s, 'llm') || has(s, 'ai'),
    purpose: 'Memanggil LLM untuk klasifikasi/ringkasan/generasi.',
    fields: [
      ['Model', 'Pilih model sesuai kebutuhan (murah untuk klasifikasi, kuat untuk reasoning)'],
      ['Prompt', 'Instruksi sistem + data dinamis via ekspresi'],
      ['Output Format', 'Wajib Structured Output Parser (JSON Schema) untuk output mesin'],
    ],
    credential:
      'API key dari provider (OpenAI/Azure/dst) → credential n8n → pilih di node model.',
    testTip: 'Selalu tambahkan validasi semantik (node Code) setelah parser — bentuk benar belum berarti isi benar.',
  },
  {
    match: s => has(s, 'telegram') || has(s, 'whatsapp') || has(s, 'discord'),
    purpose: 'Kirim pesan via platform chat.',
    fields: [
      ['Chat/Channel ID', 'ID tujuan (Telegram chat id / WhatsApp nomor format internasional)'],
      ['Text/Message', 'Isi pesan; dukung ekspresi'],
    ],
    credential:
      'Telegram: buat bot via @BotFather → salin token. WhatsApp Cloud: Meta Business → WhatsApp product → Phone Number ID + Permanent Access Token. Discord: webhook URL per-channel.',
    testTip: 'Kirim ke chat pribadi sendiri dulu sebelum grup/channel produksi.',
  },
  {
    match: s => has(s, 'set') || has(s, 'edit fields') || has(s, 'transform'),
    purpose: 'Memetakan/membersihkan field data.',
    fields: [
      ['Fields to Set', 'Daftar field output beserta nilai/ekspresinya'],
      ['Include Other Fields', 'true bila field input perlu diteruskan'],
    ],
    testTip: 'Pin data input (pin icon) agar hasil mapping bisa diinspeksi tanpa run penuh.',
  },
  {
    match: s => has(s, 'code') || has(s, 'function'),
    purpose: 'Transformasi/validasi custom dengan JavaScript.',
    fields: [
      ['Mode', 'Run Once for All Items vs Each Item'],
      ['Script', 'Logika JS; SELALU return array objek'],
    ],
    testTip: 'Gunakan console.log($json) sementara untuk debug lalu hapus.',
  },
  {
    match: s => has(s, 'if') || has(s, 'condition') || has(s, 'switch'),
    purpose: 'Percabangan alur berdasarkan kondisi.',
    fields: [
      ['Condition', 'Ekspresi boolean, mis. {{$json.valid}} === true'],
      ['True/False Output', 'Kedua cabang harus punya tujuan eksplisit (tidak boleh dead-end)'],
    ],
    testTip: 'Uji satu data valid dan satu invalid; pastikan kedua cabang tereksekusi sesuai harapan.',
  },
]

function guideFor(step: GuideStep): NodeGuide {
  return (
    NODE_GUIDES.find(g => g.match(step)) ?? {
      match: () => true,
      purpose:
        (step.description as string) ||
        'Langkah pemrosesan di dalam workflow.',
      fields: Object.entries({ ...(step.config ?? {}), ...(step.parameters ?? {}) })
        .slice(0, 8)
        .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)] as [string, string]),
      testTip: 'Jalankan node tunggal (Execute Step) dan periksa output JSON-nya.',
    }
  )
}

function stepLines(steps: GuideStep[], depth: number, out: string[]) {
  steps.forEach((step, i) => {
    const g = guideFor(step)
    const name = step.title || `${step.type || 'step'} ${i + 1}`
    const badge = [step.nodeType, step.app ? `app: ${step.app}` : null].filter(Boolean).join(' · ')
    out.push(`${'  '.repeat(depth)}### ${depth > 0 ? '↳ ' : ''}${name}`)
    if (badge) out.push(`${'  '.repeat(depth)}\`${badge}\``)
    out.push('')
    out.push(`${'  '.repeat(depth)}**Fungsi:** ${g.purpose}`)
    out.push('')
    if (g.fields.length) {
      out.push(`${'  '.repeat(depth)}| Field | Panduan Pengisian |`)
      out.push(`${'  '.repeat(depth)}|---|---|`)
      g.fields.forEach(([f, d]) => out.push(`${'  '.repeat(depth)}| ${f} | ${d} |`))
      out.push('')
    }
    if (g.credential) {
      out.push(`${'  '.repeat(depth)}**Credential:** ${g.credential}`)
      out.push('')
    }
    out.push(`${'  '.repeat(depth)}**Cara tes:** ${g.testTip}`)
    out.push('')
    if (Array.isArray(step.branches)) {
      step.branches.forEach(b => {
        out.push(`${'  '.repeat(depth)}#### Cabang: ${b.label || b.key}`)
        out.push('')
        if (b.steps?.length) stepLines(b.steps, depth + 1, out)
      })
    }
  })
}

export function generateSetupGuideMarkdown(
  workflowName: string,
  steps: GuideStep[],
  summary?: string
): string {
  const out: string[] = []
  out.push(`# Setup Guide — ${workflowName}`)
  out.push('')
  out.push(`> Panduan konfigurasi per node. Generate otomatis ${new Date().toISOString().slice(0, 10)} oleh Aivory Copilot.`)
  out.push('')
  if (summary) {
    out.push(`**Ringkasan:** ${summary}`)
    out.push('')
  }
  out.push('## Daftar Isi')
  out.push('')
  steps.forEach((s, i) => out.push(`${i + 1}. ${s.title || s.id || `Step ${i + 1}`}`))
  out.push('')
  out.push('## Konfigurasi Per Node')
  out.push('')
  stepLines(steps, 0, out)
  out.push('---')
  out.push('')
  out.push('## Checklist Sebelum Aktivasi')
  out.push('')
  out.push('- [ ] Semua credential terpasang (lihat bagian Credential di tiap node)')
  out.push('- [ ] Sandbox test lolos (real execution)')
  out.push('- [ ] Setiap cabang punya tujuan akhir (tidak ada dead-end)')
  out.push('- [ ] Node berisiko (email/HTTP tulis) punya retry + error branch')
  out.push('- [ ] Timezone workflow settings sudah benar')
  out.push('')
  return out.join('\n')
}
