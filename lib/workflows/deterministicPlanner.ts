/**
 * deterministicPlanner — LLM-free request analysis, template planning, and
 * workflow sanitation for the copilot state machine.
 *
 * Purpose: make the copilot's behavior depend on deterministic logic wherever
 * the problem is actually deterministic, and reserve the LLM for genuinely
 * open-ended work. Three capabilities:
 *
 *   1. analyzeRequest()   — decides whether a request is specific enough to
 *                           skip the clarify round entirely (saves one full
 *                           LLM round trip, ~10-15s).
 *   2. matchTemplate()    — recognizes common automation patterns
 *                           (X → notify Y, schedule → report, form → CRM)
 *                           and builds the workflow instantly with zero LLM
 *                           calls (sub-second instead of ~10s).
 *   3. sanitizeWorkflow() — normalizes/repairs LLM output locally (missing
 *                           ids, wrong first-step type, unknown step types,
 *                           missing titles) so structural defects never cost
 *                           an LLM repair round.
 */

import type { GeneratedWorkflowStep } from './copilotStateMachine'

// ── App catalog ──────────────────────────────────────────────────────────────
// Canonical app ids with the aliases users actually type. `roles` describes
// whether the app typically appears as an event source, an action target, or
// both — used to decide whether a request names "enough" of a pipeline.

interface CatalogApp {
  id: string
  label: string
  aliases: string[]
  roles: ('source' | 'target')[]
}

const APP_CATALOG: CatalogApp[] = [
  { id: 'slack',      label: 'Slack',           aliases: ['slack'],                                        roles: ['source', 'target'] },
  { id: 'gmail',      label: 'Gmail',           aliases: ['gmail', 'google mail'],                         roles: ['source', 'target'] },
  { id: 'email',      label: 'Email',           aliases: ['email', 'e-mail', 'surel'],                     roles: ['source', 'target'] },
  { id: 'whatsapp',   label: 'WhatsApp',        aliases: ['whatsapp', 'wa'],                               roles: ['source', 'target'] },
  { id: 'telegram',   label: 'Telegram',        aliases: ['telegram'],                                     roles: ['source', 'target'] },
  { id: 'zendesk',    label: 'Zendesk',         aliases: ['zendesk'],                                      roles: ['source', 'target'] },
  { id: 'freshdesk',  label: 'Freshdesk',       aliases: ['freshdesk'],                                    roles: ['source', 'target'] },
  { id: 'jira',       label: 'Jira',            aliases: ['jira'],                                         roles: ['source', 'target'] },
  { id: 'hubspot',    label: 'HubSpot',         aliases: ['hubspot'],                                      roles: ['source', 'target'] },
  { id: 'salesforce', label: 'Salesforce',      aliases: ['salesforce'],                                   roles: ['source', 'target'] },
  { id: 'notion',     label: 'Notion',          aliases: ['notion'],                                       roles: ['target'] },
  { id: 'sheets',     label: 'Google Sheets',   aliases: ['google sheets', 'sheets', 'spreadsheet', 'spreadsheets'], roles: ['source', 'target'] },
  { id: 'forms',      label: 'Form',            aliases: ['google form', 'typeform', 'jotform', 'form submission', 'formulir', 'web form', 'contact form'], roles: ['source'] },
  { id: 'shopify',    label: 'Shopify',         aliases: ['shopify'],                                      roles: ['source', 'target'] },
  { id: 'stripe',     label: 'Stripe',          aliases: ['stripe'],                                       roles: ['source'] },
  { id: 'webhook',    label: 'Webhook',         aliases: ['webhook', 'http endpoint', 'api call'],         roles: ['source', 'target'] },
  { id: 'crm',        label: 'CRM',             aliases: ['crm'],                                          roles: ['source', 'target'] },
  { id: 'helpdesk',   label: 'Helpdesk',        aliases: ['helpdesk', 'help desk', 'ticketing', 'ticket system'], roles: ['source'] },
  { id: 'database',   label: 'Database',        aliases: ['database', 'postgres', 'postgresql', 'mysql', 'db '],  roles: ['source', 'target'] },
]

// Trigger phrasing — event-style ("when X happens") or schedule-style
const TRIGGER_PATTERNS = [
  /\bwhen(ever)?\b/i, /\bon new\b/i, /\bevery time\b/i, /\beach time\b/i,
  /\bif (a|an|there)\b/i, /\barrives?\b/i, /\bincoming\b/i, /\bnew\b/i,
  /\bsetiap (kali|ada)\b/i, /\bketika\b/i, /\bsaat\b/i, /\bjika ada\b/i, /\bkalau ada\b/i, /\bmasuk\b/i,
]
const SCHEDULE_PATTERNS = [
  /\bevery (day|week|month|morning|monday|hour|\d+)\b/i, /\bdaily\b/i, /\bweekly\b/i, /\bmonthly\b/i,
  /\bschedule[d]?\b/i, /\bcron\b/i, /\bat \d{1,2}(:\d{2})?\s*(am|pm)?\b/i,
  /\bsetiap (hari|minggu|bulan|pagi|jam|senin)\b/i, /\bharian\b/i, /\bmingguan\b/i, /\bbulanan\b/i, /\bterjadwal\b/i,
]
const NOTIFY_PATTERNS = [
  /\bnotify\b/i, /\bnotification\b/i, /\balert\b/i, /\bsend (a )?(message|msg|email|notification|alert|report|summary)\b/i,
  /\bpost (to|a message)\b/i, /\bkirim (pesan|notifikasi|email|laporan|ringkasan)\b/i, /\bberi ?tahu\b/i, /\bkabari\b/i,
]
const REPORT_PATTERNS = [
  /\breport\b/i, /\bsummary\b/i, /\bdigest\b/i, /\brecap\b/i, /\blaporan\b/i, /\bringkasan\b/i, /\brekap\b/i,
]
const CRM_SAVE_PATTERNS = [
  /\b(add|save|create|log|store|record)\b.*\b(lead|contact|deal|record|row|entry)\b/i,
  /\b(simpan|catat|tambahkan|masukkan)\b/i,
]

export interface RequestAnalysis {
  detectedApps: CatalogApp[]
  sourceApp: CatalogApp | null
  targetApp: CatalogApp | null
  hasTrigger: boolean
  hasSchedule: boolean
  hasNotifyIntent: boolean
  /** Specific enough to generate without a clarify round. */
  isSpecific: boolean
}

/** Find catalog apps mentioned in the text, in order of appearance. */
function detectApps(text: string): CatalogApp[] {
  const lower = ` ${text.toLowerCase()} `
  const found: { app: CatalogApp; index: number }[] = []
  for (const app of APP_CATALOG) {
    let best = -1
    for (const alias of app.aliases) {
      const idx = lower.indexOf(alias)
      if (idx >= 0 && (best < 0 || idx < best)) best = idx
    }
    if (best >= 0) found.push({ app, index: best })
  }
  found.sort((a, b) => a.index - b.index)
  return found.map((f) => f.app)
}

/**
 * Deterministic specificity analysis. A request that names a trigger signal
 * plus a source and a distinct target (or a schedule plus a target) contains
 * everything generation needs — asking clarifying questions first only adds
 * a ~10-15s LLM round trip for information we already have.
 */
export function analyzeRequest(text: string): RequestAnalysis {
  const apps = detectApps(text)
  const hasTrigger = TRIGGER_PATTERNS.some((p) => p.test(text))
  const hasSchedule = SCHEDULE_PATTERNS.some((p) => p.test(text))
  const hasNotifyIntent = NOTIFY_PATTERNS.some((p) => p.test(text))

  // First app playing a source role = source; first DIFFERENT app playing a
  // target role = target. Order of mention approximates data-flow direction
  // ("when a Zendesk ticket arrives, send a Slack message").
  const sourceApp = apps.find((a) => a.roles.includes('source')) ?? null
  const targetApp = apps.find((a) => a !== sourceApp && a.roles.includes('target')) ?? null

  const isSpecific =
    (hasTrigger || hasSchedule) &&
    ((sourceApp !== null && targetApp !== null) ||
      (hasSchedule && (targetApp !== null || sourceApp !== null)))

  return { detectedApps: apps, sourceApp, targetApp, hasTrigger, hasSchedule, hasNotifyIntent, isSpecific }
}

// ── Template planner ─────────────────────────────────────────────────────────

export interface TemplateWorkflow {
  workflowName: string
  steps: GeneratedWorkflowStep[]
  estimate_hours: number
  automation_score: number
  summary: string
  /** Which template produced this — logged for observability. */
  templateId: string
}

function step(
  id: string,
  type: GeneratedWorkflowStep['type'],
  title: string,
  description: string,
  config: Record<string, unknown> = {},
): GeneratedWorkflowStep {
  // Promote app/action to the step root — the bridge's draft service reads
  // step.app as its primary node-resolution signal (config.app is only a
  // fallback).
  const app = typeof config.app === 'string' ? config.app : undefined
  const action = typeof config.action === 'string' ? config.action : undefined
  return {
    id, type, title, description, config, testable: true,
    ...(app ? { app } : {}),
    ...(action ? { action } : {}),
  }
}

/**
 * Recognize common automation patterns and build the workflow locally.
 * Returns null when no template applies with high confidence — the LLM
 * handles everything else. Templates only fire when BOTH endpoints of the
 * pipeline are explicitly named, so we never guess the user's stack.
 */
export function matchTemplate(text: string, analysis?: RequestAnalysis): TemplateWorkflow | null {
  const a = analysis ?? analyzeRequest(text)

  // ── Pattern 1: event → notification ("when X happens, tell Y") ────────────
  if (a.sourceApp && a.targetApp && a.hasNotifyIntent && (a.hasTrigger || a.hasSchedule) && !a.hasSchedule) {
    const src = a.sourceApp
    const dst = a.targetApp
    return {
      templateId: 'event-notify',
      workflowName: `${src.label} to ${dst.label} Notification`,
      steps: [
        step('s1', 'trigger', `New ${src.label} event`, `Triggers when a new item arrives in ${src.label}.`, { app: src.id, action: 'webhook' }),
        step('s2', 'action', 'Format notification', `Builds the ${dst.label} message from the incoming ${src.label} payload (key fields, link, priority).`, { app: 'formatter', action: 'format_message' }),
        step('s3', 'action', `Send to ${dst.label}`, `Delivers the formatted notification to ${dst.label}.`, { app: dst.id, action: 'send_message' }),
      ],
      estimate_hours: 0.5,
      automation_score: 90,
      summary: `Sends a ${dst.label} notification whenever a new event arrives in ${src.label}. Built instantly from a proven pattern — reply "edit" to tailor fields, filters, or routing.`,
    }
  }

  // ── Pattern 2: schedule → report ("every Monday, send a summary") ─────────
  if (a.hasSchedule && REPORT_PATTERNS.some((p) => p.test(text))) {
    const dst = a.targetApp ?? a.sourceApp
    const src = a.sourceApp && a.sourceApp !== dst ? a.sourceApp : null
    if (dst) {
      return {
        templateId: 'schedule-report',
        workflowName: `Scheduled Report to ${dst.label}`,
        steps: [
          step('s1', 'trigger', 'Schedule trigger', 'Runs on the configured schedule (daily/weekly/monthly).', { app: 'schedule', action: 'cron' }),
          step('s2', 'action', 'Collect data', src ? `Pulls the latest records from ${src.label}.` : 'Pulls the latest records from the configured data source.', { app: src?.id ?? 'database', action: 'fetch_records' }),
          step('s3', 'action', 'Build report', 'Aggregates the records into a readable summary (totals, highlights, trends).', { app: 'formatter', action: 'build_report' }),
          step('s4', 'action', `Deliver to ${dst.label}`, `Sends the report to ${dst.label}.`, { app: dst.id, action: 'send_message' }),
        ],
        estimate_hours: 1,
        automation_score: 85,
        summary: `Generates and delivers a recurring report to ${dst.label} on a schedule. Built instantly from a proven pattern — reply "edit" to adjust the schedule, data source, or report contents.`,
      }
    }
  }

  // ── Pattern 3: form/lead capture → CRM ("save form submissions to CRM") ───
  if (a.sourceApp?.id === 'forms' && a.targetApp && CRM_SAVE_PATTERNS.some((p) => p.test(text))) {
    const dst = a.targetApp
    return {
      templateId: 'form-to-crm',
      workflowName: `Form Submissions to ${dst.label}`,
      steps: [
        step('s1', 'trigger', 'New form submission', 'Triggers when someone submits the form.', { app: 'forms', action: 'webhook' }),
        step('s2', 'action', 'Validate & normalize', 'Checks required fields and normalizes formats (email, phone, name casing).', { app: 'formatter', action: 'validate' }),
        step('s3', 'action', `Create record in ${dst.label}`, `Creates or updates the contact/lead in ${dst.label} with the submission data.`, { app: dst.id, action: 'create_record' }),
      ],
      estimate_hours: 0.5,
      automation_score: 90,
      summary: `Captures every form submission into ${dst.label} automatically. Built instantly from a proven pattern — reply "edit" to add deduplication, notifications, or extra fields.`,
    }
  }

  return null
}

// ── Workflow sanitation ──────────────────────────────────────────────────────

const VALID_STEP_TYPES = new Set(['trigger', 'action', 'condition', 'channel'])
const TYPE_COERCIONS: Record<string, GeneratedWorkflowStep['type']> = {
  ai: 'action',
  filter: 'condition',
  webhook: 'trigger',
  schedule: 'trigger',
  notification: 'channel',
}

export interface SanitizeResult {
  steps: GeneratedWorkflowStep[]
  /** Human-readable list of local fixes applied (empty = already clean). */
  fixes: string[]
}

/**
 * Normalize an LLM-generated step list locally. Every fix here is one the
 * old flow paid an LLM "repair" round for — structural defects are
 * deterministic to detect and deterministic to fix.
 */
export function sanitizeWorkflow(rawSteps: unknown): SanitizeResult {
  const fixes: string[] = []
  const stepsIn: Record<string, unknown>[] = Array.isArray(rawSteps)
    ? rawSteps.filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    : []

  const steps: GeneratedWorkflowStep[] = stepsIn.map((s, i) => {
    // id — required, unique
    let id = typeof s.id === 'string' && s.id.trim() ? s.id.trim() : ''
    if (!id) {
      id = `s${i + 1}`
      fixes.push(`step ${i + 1}: missing id → "${id}"`)
    }

    // type — coerce known synonyms, default to action
    let type = typeof s.type === 'string' ? s.type.trim().toLowerCase() : ''
    if (!VALID_STEP_TYPES.has(type)) {
      const coerced = TYPE_COERCIONS[type] ?? 'action'
      if (type) fixes.push(`step ${id}: type "${type}" → "${coerced}"`)
      else fixes.push(`step ${id}: missing type → "action"`)
      type = coerced
    }

    // title — fall back to action/description snippets
    let title = typeof s.title === 'string' && s.title.trim() ? s.title.trim() : ''
    if (!title) {
      const alt = typeof s.action === 'string' ? s.action : typeof s.description === 'string' ? s.description : ''
      title = alt ? alt.slice(0, 60) : `Step ${i + 1}`
      fixes.push(`step ${id}: missing title → "${title}"`)
    }

    const description = typeof s.description === 'string' ? s.description : ''
    const config = s.config && typeof s.config === 'object' ? s.config as Record<string, unknown> : {}
    const nodeType = typeof s.nodeType === 'string' && s.nodeType ? s.nodeType : undefined
    // app/action drive the draft service's node resolution — never drop them.
    const app = typeof s.app === 'string' && s.app ? s.app.toLowerCase() : undefined
    const action = typeof s.action === 'string' && s.action ? s.action : undefined

    return {
      id,
      type: type as GeneratedWorkflowStep['type'],
      title,
      description,
      config,
      testable: s.testable !== false,
      ...(nodeType ? { nodeType } : {}),
      ...(app ? { app } : {}),
      ...(action ? { action } : {}),
    }
  })

  // Dedupe ids
  const seen = new Set<string>()
  for (let i = 0; i < steps.length; i++) {
    if (seen.has(steps[i].id)) {
      const newId = `${steps[i].id}_${i + 1}`
      fixes.push(`step ${i + 1}: duplicate id "${steps[i].id}" → "${newId}"`)
      steps[i] = { ...steps[i], id: newId }
    }
    seen.add(steps[i].id)
  }

  // First step must be the trigger
  if (steps.length > 0 && steps[0].type !== 'trigger') {
    const triggerIdx = steps.findIndex((s) => s.type === 'trigger')
    if (triggerIdx > 0) {
      const [trigger] = steps.splice(triggerIdx, 1)
      steps.unshift(trigger)
      fixes.push(`moved trigger step "${trigger.id}" to position 1`)
    } else {
      steps[0] = { ...steps[0], type: 'trigger' }
      fixes.push(`step "${steps[0].id}": coerced to trigger (workflow had none)`)
    }
  }

  return { steps, fixes }
}
