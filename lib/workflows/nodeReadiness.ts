/**
 * Node readiness engine — one pure place that answers "what does this node
 * still need before it can run?". Used by the per-node setup modal
 * (getDeployChecklist), the "Ready to deploy" badge and the inspector's
 * workflow-health summary, so all three always agree.
 *
 * Checks, per node:
 *   1. credential slots in `credentials` with an empty id (or a node that
 *      always needs a credential but has no slot at all)
 *   2. required parameters that are empty (curated per node type/operation,
 *      names verified against evals/workflow-builder/node-catalog.json)
 *   3. placeholder values left by the generator (example.com, YOUR_…,
 *      UNRESOLVED_INTEGRATION, empty resource locators)
 */

export type ReadinessSeverity = 'error' | 'warn'
export type ReadinessKind = 'credential' | 'required' | 'placeholder'

export interface ReadinessItem {
  id: string
  kind: ReadinessKind
  severity: ReadinessSeverity
  /** Human-readable, e.g. "Connect your Google Drive account". */
  message: string
  /** App the item belongs to (for grouping connections), e.g. "Google Drive". */
  app?: string
  /** Parameter path for required/placeholder items. */
  field?: string
}

/** Minimal node shape the engine needs (a subset of WorkflowNodeData). */
export interface ReadinessNodeInput {
  title?: string
  label?: string
  connectionId?: string
  rawN8n?: {
    type?: string
    parameters?: Record<string, any>
    credentials?: Record<string, { id?: string; name?: string } | undefined>
  } | null
}

/** Shared with the eval scorer. */
export const PLACEHOLDER_PATTERN = /api\.example\.com|UNRESOLVED_INTEGRATION|YOUR_[A-Z_]+|hooks\.slack\.com\/services\/YOUR/i

// ── apps ────────────────────────────────────────────────────────────────

/** n8n credential type → app label. Matched by prefix of the credential key. */
const CRED_APP: [RegExp, string][] = [
  [/^slack/i, 'Slack'],
  [/^gmail|^googleApi$/i, 'Gmail'],
  [/^googleSheets/i, 'Google Sheets'],
  [/^googleDrive/i, 'Google Drive'],
  [/^googleCalendar/i, 'Google Calendar'],
  [/^hubspot/i, 'HubSpot'],
  [/^zendesk/i, 'Zendesk'],
  [/^asana/i, 'Asana'],
  [/^telegram/i, 'Telegram'],
  [/^notion/i, 'Notion'],
  [/^openAi/i, 'OpenAI'],
  [/^anthropic/i, 'Anthropic'],
  [/^airtable/i, 'Airtable'],
  [/^github/i, 'GitHub'],
  [/^discord/i, 'Discord'],
  [/^postgres/i, 'Postgres'],
  [/^mySql/i, 'MySQL'],
  [/^smtp/i, 'SMTP'],
]

/** Node types that always need a credential (used when the slot is missing entirely). */
const NODE_APP: Record<string, { app: string; credType: string }> = {
  'n8n-nodes-base.slack': { app: 'Slack', credType: 'slackApi' },
  'n8n-nodes-base.gmail': { app: 'Gmail', credType: 'gmailOAuth2' },
  'n8n-nodes-base.googleSheets': { app: 'Google Sheets', credType: 'googleSheetsOAuth2Api' },
  'n8n-nodes-base.googleDrive': { app: 'Google Drive', credType: 'googleDriveOAuth2Api' },
  'n8n-nodes-base.googleCalendar': { app: 'Google Calendar', credType: 'googleCalendarOAuth2Api' },
  'n8n-nodes-base.hubspot': { app: 'HubSpot', credType: 'hubspotApi' },
  'n8n-nodes-base.zendesk': { app: 'Zendesk', credType: 'zendeskApi' },
  'n8n-nodes-base.asana': { app: 'Asana', credType: 'asanaApi' },
  'n8n-nodes-base.telegram': { app: 'Telegram', credType: 'telegramApi' },
  'n8n-nodes-base.notion': { app: 'Notion', credType: 'notionApi' },
  'n8n-nodes-base.openAi': { app: 'OpenAI', credType: 'openAiApi' },
  '@n8n/n8n-nodes-langchain.lmChatOpenAi': { app: 'OpenAI', credType: 'openAiApi' },
  '@n8n/n8n-nodes-langchain.lmChatAnthropic': { app: 'Anthropic', credType: 'anthropicApi' },
}

const APP_FROM_TYPE: Record<string, string> = {}
for (const [t, v] of Object.entries(NODE_APP)) APP_FROM_TYPE[t] = v.app

export function appLabelForNode(type: string | undefined): string | undefined {
  if (!type) return undefined
  if (APP_FROM_TYPE[type]) return APP_FROM_TYPE[type]
  const short = type.split('.').pop() ?? ''
  const spaced = short.replace(/Trigger$/, '').replace(/([a-z])([A-Z])/g, '$1 $2')
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : undefined
}

function appForCredential(credKey: string, nodeType: string | undefined): string {
  // `googleApi` is shared by several Google nodes, so prefer the node's own app.
  const fromNode = nodeType ? APP_FROM_TYPE[nodeType] : undefined
  if (fromNode && /^google/i.test(credKey)) return fromNode
  for (const [re, label] of CRED_APP) if (re.test(credKey)) return label
  return fromNode ?? appLabelForNode(nodeType) ?? credKey
}

// ── value helpers ───────────────────────────────────────────────────────

function isResourceLocator(v: any): boolean {
  return v && typeof v === 'object' && v.__rl === true
}

/** True when a parameter value carries no information. */
export function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === 'string') return v.trim() === '' || v.trim() === '='
  if (isResourceLocator(v)) return isEmptyValue((v as any).value)
  return false
}

function* walkStrings(value: unknown, path = ''): Generator<[string, string]> {
  if (typeof value === 'string') yield [path, value]
  else if (Array.isArray(value)) for (let i = 0; i < value.length; i++) yield* walkStrings(value[i], `${path}[${i}]`)
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) yield* walkStrings(v, path ? `${path}.${k}` : k)
  }
}

// ── required parameters ─────────────────────────────────────────────────

interface Required {
  field: string
  label: string
}

const req = (field: string, label: string): Required => ({ field, label })

/**
 * Required parameters per node type (and resource/operation where it matters).
 * Only fields a user must fill by hand — fields the generator maps from
 * incoming data with expressions count as filled.
 */
function requiredFor(type: string, p: Record<string, any>): Required[] {
  const resource = p.resource
  const op = p.operation
  switch (type) {
    case 'n8n-nodes-base.slack':
      if (op === 'history' || op === 'getAll' || (resource === 'channel' && op !== 'create')) {
        return [req('channelId', 'channel')]
      }
      if (op === 'post' || op === 'send' || resource === 'message' || op === undefined) {
        return [req('channelId', 'channel'), req('text', 'message text')]
      }
      return []
    case 'n8n-nodes-base.gmail':
      if (op === 'getAll' || op === 'get' || op === 'delete') return []
      return [req('sendTo', 'recipient'), req('subject', 'subject'), req('message', 'message body')]
    case 'n8n-nodes-base.googleSheets':
      return [req('documentId', 'spreadsheet'), req('sheetName', 'sheet')]
    case 'n8n-nodes-base.googleDrive': {
      const o = p.operation
      if (o === 'download' || o === 'deleteFile' || o === 'copy' || o === 'move' || o === 'share') return [req('fileId', 'file')]
      if (o === 'upload') return [req('name', 'file name')]
      if (o === 'createFromText') return [req('content', 'file content'), req('name', 'file name')]
      return [] // search / list work without extra fields
    }
    case 'n8n-nodes-base.httpRequest':
      return [req('url', 'URL')]
    case 'n8n-nodes-base.telegram':
      return [req('chatId', 'chat ID'), req('text', 'message text')]
    case 'n8n-nodes-base.notion':
      return p.operation === 'getAll' || p.operation === 'create' ? [req('databaseId', 'database')] : []
    case 'n8n-nodes-base.asana':
      return [req('workspace', 'workspace')]
    case 'n8n-nodes-base.rssFeedRead':
      return [req('url', 'feed URL')]
    case 'n8n-nodes-base.webhook':
      return [req('path', 'webhook path')]
    case 'n8n-nodes-base.code':
      return [req('jsCode', 'code')]
    default:
      return []
  }
}

// ── engine ──────────────────────────────────────────────────────────────

/** Everything this node still needs. Empty array = ready. */
export function evaluateNodeReadiness(node: ReadinessNodeInput): ReadinessItem[] {
  const raw = node.rawN8n
  if (!raw?.type) return []
  const type = raw.type
  const params = raw.parameters ?? {}
  const items: ReadinessItem[] = []
  const linked = Boolean(node.connectionId)

  // 1. credentials
  const slots = Object.entries(raw.credentials ?? {})
  for (const [key, slot] of slots) {
    if (linked) continue
    if (!slot || isEmptyValue(slot.id)) {
      const app = appForCredential(key, type)
      items.push({
        id: `cred:${key}`, kind: 'credential', severity: 'error', app,
        message: `Connect your ${app} account`,
      })
    }
  }
  const known = NODE_APP[type]
  if (known && slots.length === 0 && !linked) {
    items.push({
      id: `cred:${known.credType}`, kind: 'credential', severity: 'error', app: known.app,
      message: `Connect your ${known.app} account`,
    })
  }

  // 2. required parameters (empty or empty resource locator)
  const flagged = new Set<string>()
  for (const r of requiredFor(type, params)) {
    // the Code node stores python in pythonCode
    const value = r.field === 'jsCode' && params.language === 'python' ? params.pythonCode : params[r.field]
    // Gmail "send" can also use toList
    if (r.field === 'sendTo' && !isEmptyValue(params.toList)) continue
    if (isEmptyValue(value)) {
      flagged.add(r.field)
      items.push({
        id: `req:${r.field}`, kind: 'required', severity: 'error', field: r.field,
        message: `Choose the ${r.label}`,
        app: appForCredential('', type),
      })
    }
  }

  // 3. placeholders
  for (const [path, v] of walkStrings(params)) {
    if (!PLACEHOLDER_PATTERN.test(v) && !/example\.com\/endpoint/i.test(v)) continue
    const top = path.split(/[.[]/)[0]
    if (flagged.has(top)) continue
    items.push({
      id: `ph:${path}`, kind: 'placeholder', severity: 'error', field: path,
      message: `Replace the placeholder value in "${path}"`,
    })
  }

  return items
}

export function isNodeReady(node: ReadinessNodeInput): boolean {
  return evaluateNodeReadiness(node).every((i) => i.severity !== 'error')
}

// ── workflow-level summary ──────────────────────────────────────────────

export interface WorkflowNodeInput {
  id: string
  data: ReadinessNodeInput & { category?: string }
}

export interface PendingNode {
  id: string
  title: string
  items: ReadinessItem[]
}

export interface WorkflowReadiness {
  total: number
  ready: number
  pending: PendingNode[]
  /** Required connections grouped by app. */
  connections: { app: string; nodeTitles: string[] }[]
  /** Plain-language trigger description, or null when there is no trigger. */
  trigger: string | null
}

function nodeTitle(n: WorkflowNodeInput): string {
  return (n.data.title || n.data.label || '').trim() || appLabelForNode(n.data.rawN8n?.type) || n.id
}

export function describeTrigger(node: WorkflowNodeInput): string | null {
  const raw = node.data.rawN8n
  const t = raw?.type ?? ''
  const p = raw?.parameters ?? {}
  if (t === 'n8n-nodes-base.manualTrigger') return 'Starts when you run it manually'
  if (t === 'n8n-nodes-base.webhook') {
    const path = String(p.path ?? '').replace(/^\/?/, '/')
    return path.length > 1 ? `Starts when a request arrives at ${path}` : 'Starts when a request arrives at its webhook URL'
  }
  if (t === 'n8n-nodes-base.scheduleTrigger' || t === 'n8n-nodes-base.cron') {
    const iv = p.rule?.interval?.[0] ?? {}
    const unit: string | undefined = iv.field ?? iv.field2
    const n = iv[`${unit}Interval`] ?? iv.field1
    if (unit === 'cronExpression') return `Runs on schedule (${iv.expression ?? 'custom cron'})`
    if (unit) {
      const singular = unit.replace(/s$/, '')
      return !n || Number(n) === 1 ? `Runs every ${singular}` : `Runs every ${n} ${singular}s`
    }
    return 'Runs on a schedule'
  }
  if (/Trigger$/.test(t)) return `Starts when something happens in ${appLabelForNode(t) ?? 'an app'}`
  if (node.data.category === 'trigger') return 'Starts the workflow'
  return null
}

function isTriggerNode(n: WorkflowNodeInput): boolean {
  const t = n.data.rawN8n?.type ?? ''
  return n.data.category === 'trigger' || /Trigger$/.test(t) || t === 'n8n-nodes-base.webhook' || t === 'n8n-nodes-base.cron'
}

export function summarizeWorkflowReadiness(nodes: WorkflowNodeInput[]): WorkflowReadiness {
  const pending: PendingNode[] = []
  const byApp = new Map<string, Set<string>>()
  let ready = 0
  for (const n of nodes) {
    const items = evaluateNodeReadiness(n.data)
    if (items.some((i) => i.severity === 'error')) {
      pending.push({ id: n.id, title: nodeTitle(n), items })
    } else ready++
    for (const i of items) {
      if (i.kind !== 'credential' || !i.app) continue
      if (!byApp.has(i.app)) byApp.set(i.app, new Set())
      byApp.get(i.app)!.add(nodeTitle(n))
    }
  }
  const triggerNode = nodes.find(isTriggerNode)
  return {
    total: nodes.length,
    ready,
    pending,
    connections: [...byApp.entries()].map(([app, titles]) => ({ app, nodeTitles: [...titles] })),
    trigger: triggerNode ? describeTrigger(triggerNode) : null,
  }
}
