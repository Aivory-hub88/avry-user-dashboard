/**
 * App -> n8n node table.
 *
 * The planner's `app` field (what the LLM said the step uses) is the primary
 * signal for choosing an n8n node; title regexes in nodeMapper.ts are only the
 * fallback. Everything here is plain data + small builders, and every
 * resource / operation / parameter / typeVersion is checked against the real
 * n8n node catalog by appNodes.test.ts — so the table cannot drift into
 * emitting values n8n does not have.
 */

export interface AppNodeBuild {
  type: string
  typeVersion: number
  parameters: Record<string, any>
  credentials?: Record<string, { id: string; name: string }>
  /** The node can return many items — an AI step right after it gets a Limit node. */
  multiItem?: boolean
}

export interface AppStepInfo {
  /** Step title. */
  title: string
  /** The planner's `action` slug, e.g. "append_row". */
  appAction?: string
  config?: Record<string, any>
}

// ── app names ───────────────────────────────────────────────────────────

/**
 * Canonical key -> spellings the LLM / users use. Compared after lowercasing
 * and stripping everything that is not a letter or digit, so "google_drive",
 * "Google Drive" and "googledrive" all hit the same entry.
 */
const ALIASES: Record<string, string[]> = {
  slack: ['slack'],
  hubspot: ['hubspot', 'hubspotcrm'],
  zendesk: ['zendesk'],
  asana: ['asana'],
  googlesheets: ['googlesheets', 'googlesheet', 'gsheets', 'gsheet', 'sheets', 'spreadsheet', 'spreadsheets', 'googlespreadsheet'],
  googledrive: ['googledrive', 'gdrive', 'drive'],
  googlecalendar: ['googlecalendar', 'gcal', 'calendar', 'googlecal'],
  gmail: ['gmail', 'googlemail'],
  email: ['email', 'mail', 'smtp', 'emailsend', 'sendemail', 'outlook', 'microsoftoutlook', 'imap'],
  telegram: ['telegram', 'telegrambot'],
  notion: ['notion'],
  postgres: ['postgres', 'postgresql', 'pg', 'supabase'],
  mysql: ['mysql', 'mariadb', 'sql', 'database', 'db'],
  airtable: ['airtable'],
  discord: ['discord'],
  whatsapp: ['whatsapp', 'whatsappbusiness', 'wa'],
  twilio: ['twilio', 'sms'],
  mailchimp: ['mailchimp'],
  stripe: ['stripe'],
  github: ['github', 'git'],
  shopify: ['shopify'],
  rss: ['rss', 'rssfeed', 'feed'],
  openai: ['openai', 'gpt', 'chatgpt'],
  anthropic: ['anthropic', 'claude'],
  ai: ['ai', 'llm', 'aiagent', 'agent', 'gemini', 'qwen', 'zeroclaw'],
  http: ['http', 'httprequest', 'api', 'restapi', 'rest', 'request'],
  respond: ['respond', 'respondtowebhook', 'response'],
  code: ['code', 'javascript', 'js', 'function', 'script'],
  set: ['set', 'transform', 'editfields'],
  compression: ['compression', 'compress', 'zip'],
  wait: ['wait', 'delay', 'sleep', 'pause', 'timer'],
  schedule: ['schedule', 'cron', 'scheduler', 'scheduletrigger', 'recurring'],
  webhook: ['webhook', 'form', 'forms'],
  manual: ['manual', 'manualtrigger', 'manualrun'],
  cleanup: ['cleanup', 'noop'],
}

/** Every canonical app key the mapper understands (used to ground the generator prompt). */
export const KNOWN_APP_KEYS: string[] = Object.keys(ALIASES)

const ALIAS_LOOKUP: Map<string, string> = (() => {
  const m = new Map<string, string>()
  for (const [key, names] of Object.entries(ALIASES)) for (const n of names) m.set(n, key)
  return m
})()

/** Canonical app key for whatever spelling the planner used, or null when unknown / generic ("default"). */
export function normalizeApp(raw: string | undefined | null): string | null {
  if (!raw) return null
  const flat = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!flat || flat === 'default' || flat === 'none' || flat === 'n8n' || flat === 'action') return null
  return ALIAS_LOOKUP.get(flat) ?? null
}

// ── verbs ───────────────────────────────────────────────────────────────

export type Verb = 'read' | 'write' | 'update' | 'delete'

const VERB_PATTERNS: Array<[Verb, RegExp]> = [
  ['read', /\b(read|get|fetch|look\s?up|lookup|find|search|list|retrieve|pull|query|select|load|check|ambil|mengambil|baca|membaca|cari|mencari|dapatkan|tarik)\b/i],
  ['update', /\b(update|edit|modify|change|ubah|perbarui|memperbarui)\b/i],
  ['delete', /\b(delete|remove|hapus|menghapus)\b/i],
  ['write', /\b(append|add|create|log|save|store|insert|write|post|send|record|new|tambah|menambah|tambahkan|buat|membuat|simpan|menyimpan|catat|mencatat|kirim|mengirim)\b/i],
]

/** The verb that appears first in the step text wins ("Read customers ... and email" -> read). */
export function inferVerb(text: string, fallback: Verb = 'write'): Verb {
  let best: { verb: Verb; at: number } | null = null
  for (const [verb, re] of VERB_PATTERNS) {
    const m = re.exec(text)
    if (m && (best === null || m.index < best.at)) best = { verb, at: m.index }
  }
  return best?.verb ?? fallback
}

const rl = (value: string, mode: 'id' | 'name' | 'url' | 'list' = 'id') => ({ __rl: true, value, mode })
const text = (s: AppStepInfo) => `${(s.appAction || '').replace(/_/g, ' ')} ${s.title}`
const cfg = (s: AppStepInfo, ...keys: string[]): any => {
  for (const k of keys) if (s.config && s.config[k] !== undefined && s.config[k] !== '') return s.config[k]
  return undefined
}
const cred = (type: string, label: string) => ({ [type]: { id: '', name: label } })

// ── action builders ─────────────────────────────────────────────────────

type Builder = (s: AppStepInfo) => AppNodeBuild | null

const BUILDERS: Record<string, Builder> = {
  slack(s) {
    const verb = inferVerb(text(s), 'write')
    const channel = String(cfg(s, 'channel', 'channelId', 'channel_name') ?? 'general')
    const credentials = cred('slackApi', 'Slack account')
    if (verb === 'read') {
      return {
        type: 'n8n-nodes-base.slack', typeVersion: 2.5, credentials, multiItem: true,
        parameters: { resource: 'channel', operation: 'history', channelId: rl(channel.replace(/^#/, ''), 'name'), returnAll: false, limit: 20, filters: {} },
      }
    }
    return {
      type: 'n8n-nodes-base.slack', typeVersion: 2.5, credentials,
      parameters: {
        resource: 'message', operation: 'post', select: 'channel',
        channelId: rl(channel.replace(/^#/, ''), 'name'),
        text: cfg(s, 'text', 'message') ?? '={{ $json.response || $json.body || $json.message }}',
        otherOptions: {},
      },
    }
  },

  hubspot(s) {
    const t = text(s)
    const verb = inferVerb(t, 'write')
    const credentials = cred('hubspotApi', 'HubSpot account')
    const base = { type: 'n8n-nodes-base.hubspot', typeVersion: 2.2, credentials }
    if (/\bdeals?\b/i.test(t)) {
      return verb === 'read'
        ? { ...base, multiItem: true, parameters: { resource: 'deal', operation: 'getAll', returnAll: false, limit: 50, filters: {} } }
        : { ...base, parameters: { resource: 'deal', operation: 'create', stage: cfg(s, 'stage') ?? 'appointmentscheduled', additionalFields: { dealName: '={{ $json.deal_name || $json.name }}' } } }
    }
    if (/\bcompan(y|ies)\b|perusahaan/i.test(t)) {
      return verb === 'read'
        ? { ...base, multiItem: true, parameters: { resource: 'company', operation: 'getAll', returnAll: false, limit: 50, filters: {} } }
        : { ...base, parameters: { resource: 'company', operation: 'create', name: '={{ $json.company || $json.name }}', additionalFields: {} } }
    }
    if (verb === 'read') {
      return { ...base, parameters: { resource: 'contact', operation: 'get', contactId: '={{ $json.customer_id || $json.contact_id || $json.id }}', additionalFields: {} } }
    }
    return {
      ...base,
      parameters: {
        resource: 'contact', operation: 'upsert',
        email: '={{ $json.email || $json.customer_email }}',
        additionalFields: {
          firstName: '={{ $json.first_name || $json.name }}',
          lastName: '={{ $json.last_name || "" }}',
        },
      },
    }
  },

  zendesk(s) {
    const verb = inferVerb(text(s), 'write')
    const credentials = cred('zendeskApi', 'Zendesk account')
    const base = { type: 'n8n-nodes-base.zendesk', typeVersion: 1, credentials }
    if (verb === 'read') return { ...base, parameters: { resource: 'ticket', operation: 'get', id: '={{ $json.ticket_id || $json.id }}' } }
    if (verb === 'update') {
      return { ...base, parameters: { resource: 'ticket', operation: 'update', id: '={{ $json.ticket_id || $json.id }}', updateFields: {} } }
    }
    return {
      ...base,
      parameters: {
        resource: 'ticket', operation: 'create',
        description: '={{ $json.message || $json.description || $json.body || "" }}',
        additionalFields: { subject: '={{ $json.subject || $json.title || "Aivory support ticket" }}' },
      },
    }
  },

  asana(s) {
    const credentials = cred('asanaApi', 'Asana account')
    return {
      type: 'n8n-nodes-base.asana', typeVersion: 1, credentials,
      parameters: {
        resource: 'task', operation: 'create',
        workspace: cfg(s, 'workspace') ?? '={{ $json.workspace_id || "" }}',
        name: '={{ $json.task_name || $json.name || "Onboarding task" }}',
        otherProperties: { notes: '={{ $json.description || $json.message || "" }}' },
      },
    }
  },

  googlesheets(s) {
    const verb = inferVerb(text(s), 'write')
    const credentials = cred('googleSheetsOAuth2Api', 'Google Sheets account')
    const doc = rl(String(cfg(s, 'spreadsheetId', 'documentId', 'spreadsheet_id') ?? ''), 'id')
    const sheet = rl(String(cfg(s, 'sheetName', 'sheet', 'sheet_name') ?? 'Sheet1'), 'name')
    const base = { type: 'n8n-nodes-base.googleSheets', typeVersion: 4.7, credentials }
    if (verb === 'read') {
      return { ...base, multiItem: true, parameters: { resource: 'sheet', operation: 'read', documentId: doc, sheetName: sheet, options: {} } }
    }
    if (verb === 'update') {
      return {
        ...base,
        parameters: {
          resource: 'sheet', operation: 'appendOrUpdate', documentId: doc, sheetName: sheet,
          columns: { mappingMode: 'autoMapInputData', value: null, matchingColumns: [], schema: [] }, options: {},
        },
      }
    }
    return {
      ...base,
      parameters: {
        resource: 'sheet', operation: 'append', documentId: doc, sheetName: sheet,
        columns: { mappingMode: 'autoMapInputData', value: null, matchingColumns: [], schema: [] }, options: {},
      },
    }
  },

  telegram(s) {
    return {
      type: 'n8n-nodes-base.telegram', typeVersion: 1.2, credentials: cred('telegramApi', 'Telegram account'),
      parameters: {
        resource: 'message', operation: 'sendMessage',
        chatId: cfg(s, 'chatId', 'chat_id') ?? '={{ $json.message?.chat?.id || $json.chat_id }}',
        text: cfg(s, 'text', 'message') ?? '={{ $json.response || $json.body || $json.message }}',
        additionalFields: {},
      },
    }
  },

  notion(s) {
    const verb = inferVerb(text(s), 'write')
    const credentials = cred('notionApi', 'Notion account')
    const databaseId = rl(String(cfg(s, 'databaseId', 'database_id') ?? ''), 'id')
    if (verb === 'read') {
      return { type: 'n8n-nodes-base.notion', typeVersion: 2.2, credentials, multiItem: true, parameters: { resource: 'databasePage', operation: 'getAll', databaseId, returnAll: false, limit: 50, options: {} } }
    }
    return {
      type: 'n8n-nodes-base.notion', typeVersion: 2.2, credentials,
      parameters: {
        resource: 'databasePage', operation: 'create', databaseId,
        title: '={{ $json.title || $json.name || $json.text }}',
        propertiesUi: {}, options: {},
      },
    }
  },

  postgres(s) {
    return buildSql(s, 'n8n-nodes-base.postgres', 2.6, cred('postgres', 'Postgres account'), true)
  },
  mysql(s) {
    return buildSql(s, 'n8n-nodes-base.mySql', 2.5, cred('mySql', 'MySQL account'), false)
  },

  airtable(s) {
    const verb = inferVerb(text(s), 'write')
    const credentials = cred('airtableTokenApi', 'Airtable account')
    const common = { resource: 'record', base: rl(String(cfg(s, 'baseId', 'base_id') ?? ''), 'id'), table: rl(String(cfg(s, 'tableId', 'table', 'table_id') ?? ''), 'id') }
    if (verb === 'read') {
      return { type: 'n8n-nodes-base.airtable', typeVersion: 2.2, credentials, multiItem: true, parameters: { ...common, operation: 'search', returnAll: false, limit: 50, options: {} } }
    }
    return {
      type: 'n8n-nodes-base.airtable', typeVersion: 2.2, credentials,
      parameters: { ...common, operation: 'create', columns: { mappingMode: 'autoMapInputData', value: null, matchingColumns: [], schema: [] }, options: {} },
    }
  },

  discord(s) {
    return {
      type: 'n8n-nodes-base.discord', typeVersion: 2, credentials: cred('discordBotApi', 'Discord account'),
      parameters: {
        resource: 'message', operation: 'send', sendTo: 'channel',
        guildId: rl(String(cfg(s, 'guildId', 'guild_id') ?? ''), 'id'),
        channelId: rl(String(cfg(s, 'channelId', 'channel_id', 'channel') ?? ''), 'id'),
        content: cfg(s, 'text', 'message', 'content') ?? '={{ $json.response || $json.body || $json.message }}',
        options: {},
      },
    }
  },

  whatsapp(s) {
    return {
      type: 'n8n-nodes-base.whatsApp', typeVersion: 1.1, credentials: cred('whatsAppApi', 'WhatsApp account'),
      parameters: {
        resource: 'message', operation: 'send',
        phoneNumberId: cfg(s, 'phoneNumberId', 'phone_number_id') ?? '',
        recipientPhoneNumber: cfg(s, 'to', 'phone') ?? '={{ $json.phone || $json.customer_phone }}',
        textBody: cfg(s, 'text', 'message') ?? '={{ $json.response || $json.body || $json.message }}',
        additionalFields: {},
      },
    }
  },

  twilio(s) {
    const call = /\bcall\b|telepon/i.test(text(s))
    return {
      type: 'n8n-nodes-base.twilio', typeVersion: 1, credentials: cred('twilioApi', 'Twilio account'),
      parameters: call
        ? { resource: 'call', operation: 'make', from: cfg(s, 'from') ?? '', to: cfg(s, 'to') ?? '={{ $json.phone }}', message: '={{ $json.message || $json.response }}', options: {} }
        : { resource: 'sms', operation: 'send', from: cfg(s, 'from') ?? '', to: cfg(s, 'to') ?? '={{ $json.phone || $json.customer_phone }}', message: cfg(s, 'text', 'message') ?? '={{ $json.response || $json.body || $json.message }}', options: {} },
    }
  },

  mailchimp(s) {
    const verb = inferVerb(text(s), 'write')
    const credentials = cred('mailchimpApi', 'Mailchimp account')
    if (verb === 'read') {
      return { type: 'n8n-nodes-base.mailchimp', typeVersion: 1, credentials, multiItem: true, parameters: { resource: 'member', operation: 'getAll', list: cfg(s, 'list', 'listId') ?? '', returnAll: false, limit: 50, options: {} } }
    }
    return {
      type: 'n8n-nodes-base.mailchimp', typeVersion: 1, credentials,
      parameters: { resource: 'member', operation: 'create', list: cfg(s, 'list', 'listId') ?? '', email: '={{ $json.email }}', status: 'subscribed', options: {} },
    }
  },

  stripe(s) {
    const t = text(s)
    const verb = inferVerb(t, 'write')
    const credentials = cred('stripeApi', 'Stripe account')
    const base = { type: 'n8n-nodes-base.stripe', typeVersion: 1, credentials }
    if (/\bcharge|payment|bayar|pembayaran\b/i.test(t) && verb !== 'read') {
      return { ...base, parameters: { resource: 'charge', operation: 'create', customerId: '={{ $json.customer_id }}', amount: '={{ $json.amount }}', currency: '={{ $json.currency || "usd" }}', source: '={{ $json.source }}', additionalFields: {} } }
    }
    if (verb === 'read') {
      return { ...base, parameters: { resource: 'customer', operation: 'get', customerId: '={{ $json.customer_id || $json.id }}' } }
    }
    return { ...base, parameters: { resource: 'customer', operation: 'create', name: '={{ $json.name }}', additionalFields: { email: '={{ $json.email }}' } } }
  },

  github(s) {
    const verb = inferVerb(text(s), 'write')
    const credentials = cred('githubApi', 'GitHub account')
    const common = { authentication: 'accessToken', resource: 'issue', owner: rl(String(cfg(s, 'owner') ?? ''), 'name'), repository: rl(String(cfg(s, 'repository', 'repo') ?? ''), 'name') }
    if (verb === 'read') {
      return { type: 'n8n-nodes-base.github', typeVersion: 1.1, credentials, parameters: { ...common, operation: 'get', issueNumber: '={{ $json.issue_number || $json.number }}' } }
    }
    return {
      type: 'n8n-nodes-base.github', typeVersion: 1.1, credentials,
      parameters: { ...common, operation: 'create', title: '={{ $json.title }}', body: '={{ $json.body || $json.description || "" }}', labels: [], assignees: [] },
    }
  },

  wait(s) {
    const t = text(s)
    if (/approv|review|manual|human|persetujuan|tinjau|confirm/i.test(t)) {
      return { type: 'n8n-nodes-base.wait', typeVersion: 1.1, parameters: { resume: 'webhook', options: {} } }
    }
    const { amount, unit } = parseDuration(t)
    return { type: 'n8n-nodes-base.wait', typeVersion: 1.1, parameters: { resume: 'timeInterval', amount, unit } }
  },
}

function buildSql(s: AppStepInfo, type: string, typeVersion: number, credentials: AppNodeBuild['credentials'], hasSchema: boolean): AppNodeBuild {
  const verb = inferVerb(text(s), 'read')
  const table = String(cfg(s, 'table', 'tableName', 'table_name') ?? 'table_name')
  const tableParam = hasSchema ? rl(table, 'name') : table
  const schema = hasSchema ? { schema: rl('public', 'list') } : {}
  const explicitQuery = cfg(s, 'query', 'sql')
  if (verb === 'read' || explicitQuery) {
    return {
      type, typeVersion, credentials, multiItem: true,
      parameters: { resource: 'database', operation: 'executeQuery', query: explicitQuery ?? `SELECT * FROM ${table} LIMIT 10;`, options: {} },
    }
  }
  return {
    type, typeVersion, credentials,
    parameters: {
      resource: 'database', operation: verb === 'delete' ? 'deleteTable' : verb === 'update' ? 'update' : 'insert',
      ...schema, table: tableParam, dataMode: 'autoMapInputData', options: {},
    },
  }
}

// ── durations ───────────────────────────────────────────────────────────

const UNIT_WORDS: Array<[RegExp, 'seconds' | 'minutes' | 'hours' | 'days']> = [
  [/detik|seconds?|\bsecs?\b/i, 'seconds'],
  [/menit|minutes?|\bmins?\b/i, 'minutes'],
  [/jam|hours?|\bhrs?\b/i, 'hours'],
  [/hari|days?/i, 'days'],
]

/** "Wait 2 days" / "tunggu 3 jam" -> { amount: 2, unit: 'days' } (1 hour when nothing is stated). */
export function parseDuration(s: string): { amount: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' } {
  const m = s.match(/(\d+(?:\.\d+)?)\s*([a-z]+)/i)
  if (m) {
    for (const [re, unit] of UNIT_WORDS) if (re.test(m[2])) return { amount: parseFloat(m[1]), unit }
  }
  if (/\b(a|one|satu)\s+day\b|sehari/i.test(s)) return { amount: 1, unit: 'days' }
  if (/\b(a|one|satu)\s+week\b|seminggu/i.test(s)) return { amount: 7, unit: 'days' }
  return { amount: 1, unit: 'hours' }
}

// ── triggers ────────────────────────────────────────────────────────────

export interface TriggerBuild {
  type: string
  typeVersion: number
  parameters: Record<string, any>
  credentials?: Record<string, { id: string; name: string }>
}

const TRIGGER_BUILDERS: Record<string, (t: string) => TriggerBuild> = {
  gmail: () => ({
    type: 'n8n-nodes-base.gmailTrigger', typeVersion: 1.4,
    credentials: cred('gmailOAuth2', 'Gmail account'),
    parameters: { pollTimes: { item: [{ mode: 'everyMinute' }] }, simple: true, filters: {}, options: {} },
  }),
  email: () => ({
    type: 'n8n-nodes-base.emailReadImap', typeVersion: 2.1,
    credentials: cred('imap', 'IMAP account'),
    parameters: { mailbox: 'INBOX', postProcessAction: 'read', options: {} },
  }),
  stripe: (t) => ({
    type: 'n8n-nodes-base.stripeTrigger', typeVersion: 1,
    credentials: cred('stripeApi', 'Stripe account'),
    parameters: { events: [/refund/i.test(t) ? 'charge.refunded' : /invoice/i.test(t) ? 'invoice.paid' : /customer|pelanggan/i.test(t) ? 'customer.created' : 'payment_intent.succeeded'] },
  }),
  github: (t) => ({
    type: 'n8n-nodes-base.githubTrigger', typeVersion: 1,
    credentials: cred('githubApi', 'GitHub account'),
    parameters: {
      authentication: 'accessToken', owner: rl('', 'name'), repository: rl('', 'name'),
      events: [/pull request|\bpr\b/i.test(t) ? 'pull_request' : /push|commit/i.test(t) ? 'push' : 'issues'], options: {},
    },
  }),
  slack: () => ({
    type: 'n8n-nodes-base.slackTrigger', typeVersion: 1,
    credentials: cred('slackApi', 'Slack account'),
    parameters: { trigger: ['message'], watchWorkspace: true, options: {} },
  }),
  shopify: (t) => ({
    type: 'n8n-nodes-base.shopifyTrigger', typeVersion: 1,
    credentials: cred('shopifyApi', 'Shopify account'),
    parameters: { topic: /product/i.test(t) ? 'products/create' : /customer/i.test(t) ? 'customers/create' : 'orders/create' },
  }),
  telegram: () => ({
    type: 'n8n-nodes-base.telegramTrigger', typeVersion: 1.3,
    credentials: cred('telegramApi', 'Telegram account'),
    parameters: { updates: ['message'], additionalFields: {} },
  }),
  hubspot: (t) => ({
    type: 'n8n-nodes-base.hubspotTrigger', typeVersion: 1,
    credentials: cred('hubspotDeveloperApi', 'HubSpot account'),
    parameters: { eventsUi: { eventValues: [{ name: /deal/i.test(t) ? 'deal.creation' : /company/i.test(t) ? 'company.creation' : 'contact.creation' }] }, additionalFields: {} },
  }),
  airtable: () => ({
    type: 'n8n-nodes-base.airtableTrigger', typeVersion: 1,
    credentials: cred('airtableTokenApi', 'Airtable account'),
    parameters: {},
  }),
  notion: () => ({
    type: 'n8n-nodes-base.notionTrigger', typeVersion: 1,
    credentials: cred('notionApi', 'Notion account'),
    parameters: {},
  }),
  googlesheets: () => ({
    type: 'n8n-nodes-base.googleSheetsTrigger', typeVersion: 1,
    credentials: cred('googleSheetsTriggerOAuth2Api', 'Google Sheets account'),
    parameters: {},
  }),
}

export type TriggerKind = 'schedule' | 'webhook' | 'manual' | 'app'

export interface ResolvedTrigger {
  kind: TriggerKind
  /** Present for kind === 'app'. */
  build?: TriggerBuild
}

const SCHEDULE_WORDS = /\b(jam|hari|menit|detik|minggu|bulan|hour|hourly|day|daily|night|nightly|midnight|morning|evening|week|weekly|month|monthly|minute|second|schedule|scheduled|cron|setiap|tiap|every|interval|waktu|berkala|harian|mingguan|bulanan|periodic|recurring|nightly|pagi|malam|sore)\b|\bat \d{1,2}\s?(am|pm)\b|\bjam \d/i
const MANUAL_WORDS = /\b(manual|manually|click to run|on demand|run manually|klik|dijalankan manual)\b/i

/**
 * Decide the trigger from the planner's trigger step: its `app` first, then
 * its title as a fallback.
 */
export function resolveTrigger(opts: { app?: string; title?: string; description?: string }): ResolvedTrigger {
  const key = normalizeApp(opts.app)
  const t = `${opts.title || ''} ${opts.description || ''}`
  if (key === 'schedule' || key === 'wait') return { kind: 'schedule' }
  if (key === 'manual') return { kind: 'manual' }
  if (key === 'webhook') return { kind: 'webhook' }
  if (key && TRIGGER_BUILDERS[key]) return { kind: 'app', build: TRIGGER_BUILDERS[key](t) }
  // No usable app: read the title.
  if (MANUAL_WORDS.test(t)) return { kind: 'manual' }
  if (/\b(webhook|http request|api call|form|submitted|submission)\b/i.test(t)) return { kind: 'webhook' }
  if (SCHEDULE_WORDS.test(t)) return { kind: 'schedule' }
  return { kind: 'webhook' }
}

const WEEKDAYS: Array<[RegExp, number]> = [
  [/sunday|minggu\b/i, 0], [/monday|senin/i, 1], [/tuesday|selasa/i, 2], [/wednesday|rabu/i, 3],
  [/thursday|kamis/i, 4], [/friday|jumat|jum'at/i, 5], [/saturday|sabtu/i, 6],
]

function parseHour(t: string): number | null {
  let m = t.match(/\b(\d{1,2})(?::\d{2})?\s*(am|pm)\b/i)
  if (m) {
    let h = parseInt(m[1]) % 12
    if (/pm/i.test(m[2])) h += 12
    return h
  }
  m = t.match(/(?:jam|at|pukul)\s*(\d{1,2})(?::\d{2})?\s*(pagi|siang|sore|malam)?/i)
  if (m) {
    let h = parseInt(m[1])
    if (m[2] && /sore|malam/i.test(m[2]) && h < 12) h += 12
    return h <= 23 ? h : null
  }
  if (/midnight|tengah malam/i.test(t)) return 0
  return null
}

/** Schedule Trigger parameters from the trigger text ("every 15 minutes", "setiap jam 8 pagi", "every Monday at 9am"…). */
export function scheduleParameters(raw: string): Record<string, any> {
  const t = raw.toLowerCase()
  const every = t.match(/(?:every|setiap|tiap)\s+(\d+)\s*(minute|menit|hour|jam|day|hari|second|detik)/)
  if (every) {
    const n = parseInt(every[1])
    if (/minute|menit/.test(every[2])) return { rule: { interval: [{ field: 'minutes', minutesInterval: n }] } }
    if (/hour|jam/.test(every[2])) return { rule: { interval: [{ field: 'hours', hoursInterval: n }] } }
    if (/second|detik/.test(every[2])) return { rule: { interval: [{ field: 'seconds', secondsInterval: n }] } }
    return { rule: { interval: [{ field: 'days', daysInterval: n, triggerAtHour: parseHour(t) ?? 9 }] } }
  }
  const hourMatch = t.match(/(\d+)\s*jam\b(?!\s*\d)/)
  if (hourMatch && !/jam\s*\d/.test(t)) return { rule: { interval: [{ field: 'hours', hoursInterval: parseInt(hourMatch[1]) }] } }
  const hour = parseHour(t)
  for (const [re, day] of WEEKDAYS) {
    if (re.test(t) && !/setiap hari|every day|daily/.test(t)) {
      return { rule: { interval: [{ field: 'weeks', weeksInterval: 1, triggerAtDay: [day], triggerAtHour: hour ?? 9 }] } }
    }
  }
  if (/hourly|setiap jam|tiap jam|every hour|per jam/.test(t)) return { rule: { interval: [{ field: 'hours', hoursInterval: 1 }] } }
  if (/weekly|mingguan|every week|setiap minggu/.test(t)) return { rule: { interval: [{ field: 'weeks', weeksInterval: 1, triggerAtDay: [1], triggerAtHour: hour ?? 9 }] } }
  if (/monthly|bulanan|every month|setiap bulan/.test(t)) return { rule: { interval: [{ field: 'months', monthsInterval: 1, triggerAtDayOfMonth: 1, triggerAtHour: hour ?? 9 }] } }
  if (/night|midnight|malam/.test(t) && hour === null) return { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 2 }] } }
  if (/morning|pagi/.test(t) && hour === null) return { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 8 }] } }
  if (/daily|every day|harian|setiap hari|tiap hari|each day/.test(t) || hour !== null) {
    return { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: hour ?? 9 }] } }
  }
  return { rule: { interval: [{ field: 'hours', hoursInterval: 24 }] } }
}

// ── public entry points ─────────────────────────────────────────────────

/** Apps whose action node is built from this table. */
export function hasAppBuilder(key: string | null): key is string {
  return !!key && !!BUILDERS[key]
}

export function buildAppNode(key: string, step: AppStepInfo): AppNodeBuild | null {
  return BUILDERS[key]?.(step) ?? null
}

/** Exposed for the catalog test: every (builder, sample step) the table can emit. */
export const APP_KEYS = Object.keys(BUILDERS)
export const TRIGGER_APP_KEYS = Object.keys(TRIGGER_BUILDERS)
export function buildTriggerForTest(key: string, t = ''): TriggerBuild { return TRIGGER_BUILDERS[key](t) }
