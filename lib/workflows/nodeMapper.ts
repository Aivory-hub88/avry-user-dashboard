/**
 * Universal workflow node mapping engine.
 * Detects intent from step action text and maps to appropriate n8n node.
 *
 * Intents: email, messaging, http, respond, filter, transform, schedule,
 *          calendar, humanReview, audit, compress, ssh, cleanup, ai
 *
 * AI governance: 'ai' is reserved for steps that genuinely require semantic
 * reasoning/interpretation (classification, open-ended judgement). It is
 * never the silent default for unrecognized text — see detectNodeIntent()'s
 * final fallback, which resolves to 'http' (a generic, user-configurable
 * action placeholder) instead. Preference order for an unclassified step:
 * deterministic node > integration/API node > condition/switch node >
 * human review node > AI agent (last resort).
 */

export type NodeIntent =
  | 'email'
  | 'messaging'
  | 'hubspot'
  | 'zendesk'
  | 'asana'
  | 'http'
  | 'database'
  | 'ftp'
  | 'compress'
  | 'ssh'
  | 'cleanup'
  | 'respond'
  | 'filter'
  | 'switch'
  | 'code'
  | 'transform'
  | 'schedule'
  | 'calendar'
  | 'humanReview'
  | 'audit'
  | 'rss'
  | 'ai'

// AI-step webhook target embedded into exported n8n workflows. This module is
// bundled client-side, where process.env.ZEROCLAW_WEBHOOK_URL is undefined:
// the old fallback baked a retired (and compromised) VPS IP into every
// deployed workflow's AI node. No hardcoded host; an empty URL makes the n8n
// node fail visibly at configuration time instead of silently calling a dead
// or hostile endpoint.
export const ZEROCLAW_WEBHOOK_URL = process.env.ZEROCLAW_WEBHOOK_URL || ''

// Intent detection patterns (priority order matters)
// NOTE: Use \b word boundaries for short words like "if", "ai" to avoid substring matches
// e.g. "notification" contains "if", "classify" contains "if"
// Bilingual (EN + Indonesian/ID) — blueprint step text is frequently
// generated in Bahasa Indonesia (see docs on Deep Diagnostic ID support).
const INTENT_PATTERNS: Record<NodeIntent, RegExp> = {
  respond: /\brespond\b|return\b|send.*response|reply\b|deliver.*result|webhook.*response|final.*output/i,
  // Must be checked before `filter` — "switch" used to be a filter synonym,
  // which shadowed a real Switch (multi-branch) intent from ever matching.
  switch: /\bswitch\b|multi-?way|route.*based on|multiple branches/i,
  code: /\bcode\b|\bjavascript\b|custom script|\bfunction node\b/i,
  // Human-in-the-loop review/approval/escalation — checked before `filter`
  // ("validate"/"check" would otherwise shadow it) and before `ai` (review
  // text often contains words like "assess"/"tinjau" that could be mistaken
  // for reasoning-only text).
  // Do not match bare "escalat" here: "Notify the team on escalations" is a
  // communication action, not a Wait node. Explicit "escalate to a human
  // reviewer" still matches through human/manual review wording or the
  // planner's forced intent.
  humanReview: /human review|manual review|human.in.the.loop|needs? approval|require.*approval|\bapprov(e|al)\b|meninjau|peninjauan|tinjau\b|persetujuan|kasus (luar biasa|khusus|eksepsional)|exceptional case|tidak lengkap.*(review|tinjau)/i,
  // Calendar/scheduling of a specific event (meeting, session, appointment)
  // — distinct from `schedule` below, which is a recurring/cron trigger.
  // Checked before `filter`/`ai` so "menjadwalkan sesi pengenalan" doesn't
  // fall through to a generic action or AI node.
  calendar: /\bcalendar\b|kalender|\bmeeting\b|\bappointment\b|book.*(session|meeting|call)|schedule.*(session|meeting|call|intro|interview)|menjadwalkan|penjadwalan|jadwalkan|sesi (pengenalan|perkenalan|wawancara)/i,
  // "validate"/"classify" wording is deliberately NOT here — validating
  // completeness or classifying a free-text case is a reasoning task (see
  // the `ai` pattern below), even though the resulting route is later
  // implemented as a condition/switch node by the blueprint planner.
  // "menentukan"/"tentukan" (determine/decide) IS here — routing text like
  // "determine the onboarding path" maps to a condition by default.
  filter: /condition|\bif\b|decision|\bcheck\b|\bflag\b|\bfilter\b|validate|validation|\bbranch\b|menentukan\b|tentukan\b|\bjalur\b|\brute\b/i,
  email: /email|mail\b|smtp|inbox|surel|\be-mail\b/i,
  hubspot: /hubspot/i,
  zendesk: /zendesk/i,
  asana: /asana/i,
  messaging: /slack|discord|telegram|whatsapp|\bsms\b|\bteams\b|pesan\b/i,
  // Recurring/cron trigger only — plain "jadwal"/"schedule" without a
  // calendar-event keyword above.
  schedule: /schedule|cron|daily|hourly|weekly|timer|interval|setiap (hari|jam|minggu|bulan)|harian|mingguan|bulanan|berkala/i,
  rss: /\brss\b|\bfeed\b/i,
  http: /\bhttp\b|\bapi\b|request\b|fetch\b|call.*endpoint|webhook.*call|post.*to|get.*from|ambil data|mengambil data|dapatkan data|dari sistem|dari crm|\bcrm\b/i,
  transform: /transform|convert|format\b|parse\b|extract\b|set.*value|ubah\b|konversi|format ulang/i,
  database: /mysql|postgres|postgresql|sql\b|database|db\b|query|insert|select.*from|basis data/i,
  ftp: /ftp|sftp|file.*transfer|upload.*file|download.*file|file.*server/i,
  compress: /compress|zip\b|tar\b|gzip|rar\b|archive|unzip|extract.*file|decompress/i,
  ssh: /\bssh\b|\bscp\b|\bexec\b|remote.*command|run.*command|shell\b|execute.*server/i,
  cleanup: /delete\b|remove\b|cleanup|clean.*up|purge\b|clear\b|truncate|drop\b|erase\b|hapus\b/i,
  // Explicit audit/logging phrasing only — deliberately narrow (no bare
  // "log", which false-positives on "login"/"logic") since most audit
  // trail nodes are appended structurally by the blueprint planner rather
  // than detected from free text.
  audit: /\baudit\b|\blogging\b|audit trail|catat riwayat|rekam (hasil|log)|log.*(hasil|activity|aktivitas)/i,
  ai: /\bai\b|\bllm\b|analyse|process\b|generate\b|summarise|classify|nlp|\bgpt\b|claude|qwen|reasoning|interpret|analisa|menganalisis|validasi|memvalidasi|klasifikasi|mengklasifikasikan|menilai|interpretasi/i,
}

/**
 * Detect the intent of a workflow step based on action text.
 * Exported for Aivory Copilot preview use.
 */
export function detectNodeIntent(action: string, tool?: string): NodeIntent {
  const text = `${action} ${tool || ''}`.toLowerCase()

  // Check patterns in priority order
  // Email & messaging checked BEFORE respond — "Send Email Reply" must map to email, not respond
  if (INTENT_PATTERNS.email.test(text)) return 'email'
  if (INTENT_PATTERNS.hubspot.test(text)) return 'hubspot'
  if (INTENT_PATTERNS.zendesk.test(text)) return 'zendesk'
  if (INTENT_PATTERNS.asana.test(text)) return 'asana'
  if (INTENT_PATTERNS.messaging.test(text)) return 'messaging'
  if (INTENT_PATTERNS.respond.test(text)) return 'respond'
  // switch/code checked before filter — filter's "branch" wording would
  // otherwise shadow both (see INTENT_PATTERNS comment).
  if (INTENT_PATTERNS.switch.test(text)) return 'switch'
  if (INTENT_PATTERNS.code.test(text)) return 'code'
  // Human review and calendar are specific node types that would otherwise
  // be swallowed by the broader filter/ai patterns below.
  if (INTENT_PATTERNS.humanReview.test(text)) return 'humanReview'
  if (INTENT_PATTERNS.calendar.test(text)) return 'calendar'
  if (INTENT_PATTERNS.filter.test(text)) return 'filter'
  if (INTENT_PATTERNS.schedule.test(text)) return 'schedule'
  if (INTENT_PATTERNS.rss.test(text)) return 'rss'
  if (INTENT_PATTERNS.http.test(text)) return 'http'
  if (INTENT_PATTERNS.database.test(text)) return 'database'
  if (INTENT_PATTERNS.ftp.test(text)) return 'ftp'
  if (INTENT_PATTERNS.compress.test(text)) return 'compress'
  if (INTENT_PATTERNS.ssh.test(text)) return 'ssh'
  if (INTENT_PATTERNS.cleanup.test(text)) return 'cleanup'
  if (INTENT_PATTERNS.audit.test(text)) return 'audit'
  if (INTENT_PATTERNS.transform.test(text)) return 'transform'
  if (INTENT_PATTERNS.ai.test(text)) return 'ai'

  // AI governance: an unrecognized step is NOT assumed to need reasoning.
  // Default to a generic, user-configurable HTTP action instead of silently
  // spinning up an AI Agent node — 'ai' is only ever returned above, from an
  // explicit reasoning-signal match.
  return 'http'
}

interface WorkflowStep {
  step: number
  action: string
  tool: string
  output: string
  inputs?: { url?: string; [key: string]: any }
  conditionField?: string
  aiOutputSchema?: Record<string, any>
  unresolvedIntegration?: boolean
  assignments?: { name: string; value: string }[]
  aiReasoning?: {
    reasoning_required: true
    reason: string
    deterministic_alternative_available: boolean
  }
}

interface N8nNode {
  name: string
  type: string
  typeVersion: number
  position: [number, number]
  parameters: Record<string, any>
  id?: string
  /** Full description when the display name was truncated — see buildNodeName(). */
  notes?: string
  credentials?: Record<string, { id: string; name: string }>
  // Retry/error-handling — n8n keeps these as sibling fields on the node
  // object, not nested inside `parameters`.
  retryOnFail?: boolean
  maxTries?: number
  waitBetweenTries?: number
  onError?: 'stopWorkflow' | 'continueRegularOutput' | 'continueErrorOutput'
}

/**
 * Build a node display name that never cuts a word in half. The full action
 * text is preserved up to a generous limit; only past that is it truncated —
 * at a word boundary, with an ellipsis — and the full text is kept in the
 * node's `notes` so nothing is silently lost. (n8n node names have no hard
 * 40-char limit; the old `substring(0, 40)` was an arbitrary mid-word cut.)
 */
export function buildNodeName(stepIndex: number, action: string): { name: string; notes?: string } {
  const prefix = `Step ${stepIndex + 1}: `
  const full = `${prefix}${action}`
  const MAX = 160
  if (full.length <= MAX) return { name: full }
  const cut = action.slice(0, MAX - prefix.length - 1)
  const lastSpace = cut.lastIndexOf(' ')
  const truncated = lastSpace > 0 ? cut.slice(0, lastSpace) : cut
  return { name: `${prefix}${truncated}…`, notes: full }
}

/**
 * Generate a UUID v4-like ID for n8n nodes
 */
function generateNodeId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export interface MapContext {
  stepIndex: number
  aiNodeCount: number
  isLast: boolean
}

export type N8nStepConnectionType = 'main' | 'ai_languageModel' | 'ai_memory' | 'ai_tool'

export interface StepConnection {
  from: string
  to: string
  type: N8nStepConnectionType
}

/** Result of mapping one Aivory step — usually one node, but AI steps expand
 * into an Agent node + a linked Chat Model sub-node. */
export interface MappedStepResult {
  primary: N8nNode
  extraNodes?: N8nNode[]
  extraConnections?: StepConnection[]
}

/**
 * Map detected intent to n8n node type + parameters.
 * Returns a fully configured n8n node.
 */
export function mapIntentToN8nNode(
  intent: NodeIntent,
  step: WorkflowStep,
  ctx: MapContext
): N8nNode {
  const { stepIndex, aiNodeCount } = ctx
  const { name: nodeName, notes } = buildNodeName(stepIndex, step.action)
  const position: [number, number] = [250 + ((stepIndex + 1) * 220), 300]
  const id = generateNodeId()

  const baseNode = { id, name: nodeName, position, ...(notes ? { notes } : {}) }

  switch (intent) {
    case 'respond':
      return {
        ...baseNode,
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1,
        parameters: {
          respondWith: 'json',
          responseBody: '={{ JSON.stringify({ status: "success", result: $json.response || $json.body }) }}',
        },
      }

    case 'filter': {
      const field = step.conditionField
      return {
        ...baseNode,
        type: 'n8n-nodes-base.if',
        typeVersion: 2,
        parameters: {
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 1 },
            // Any planner-supplied conditionField (is_complete, is_delayed,
            // onboarding_route, ...) becomes a boolean field check rather than
            // the free-text $json.response isNotEmpty default.
            conditions: field
              ? [
                  {
                    leftValue: `={{ $json.${field} }}`,
                    rightValue: true,
                    operator: { type: 'boolean', operation: 'equals' },
                  },
                ]
              : [
                  {
                    leftValue: '={{ $json.response }}',
                    rightValue: '',
                    operator: { type: 'string', operation: 'isNotEmpty' },
                  },
                ],
            combinator: 'and',
          },
          options: {},
        },
      }
    }

    case 'switch':
      return {
        ...baseNode,
        type: 'n8n-nodes-base.switch',
        typeVersion: 3,
        parameters: {
          mode: 'rules',
          rules: {
            values: [
              {
                conditions: {
                  options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
                  conditions: [
                    { leftValue: '={{ $json.response }}', rightValue: '', operator: { type: 'string', operation: 'isNotEmpty' } },
                  ],
                  combinator: 'and',
                },
                renameOutput: true,
                outputKey: 'Output 0',
              },
            ],
          },
          options: { fallbackOutput: 'extra' },
        },
      }

    case 'code':
      return {
        ...baseNode,
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        parameters: {
          mode: 'runOnceForAllItems',
          language: 'javaScript',
          jsCode: 'return items;',
        },
      }

    case 'email': {
      // Gmail specifically gets the native Gmail node; everything else falls
      // back to generic SMTP. Credentials intentionally omitted either way —
      // user attaches the Gmail OAuth2 / SMTP credential in n8n after activation.
      const isGmail = /gmail/i.test(`${step.tool || ''} ${step.action || ''}`)
      if (isGmail) {
        return {
          ...baseNode,
          type: 'n8n-nodes-base.gmail',
          typeVersion: 2.1,
          parameters: {
            resource: 'message',
            operation: 'send',
            sendTo: step.inputs?.to_email || '={{ $json.to || $json.user_email || $json.email }}',
            subject: step.inputs?.subject_template || "={{ 'Re: ' + ($json.subject || 'Aivory notification') }}",
            message: step.inputs?.body_template || '={{ $json.reply_text || $json.aiResponse || $json.message }}',
          },
        }
      }
      // n8n Send Email node — schema from n8n-MCP (typeVersion 2.1).
      return {
        ...baseNode,
        type: 'n8n-nodes-base.emailSend',
        typeVersion: 2.1,
        parameters: {
          resource: 'email',
          operation: 'send',
          fromEmail: step.inputs?.from_email || 'support@example.com',
          toEmail: step.inputs?.to_email || '={{ $json.to || $json.user_email || $json.email }}',
          subject: step.inputs?.subject_template || "={{ 'Re: ' + ($json.subject || 'Aivory notification') }}",
          message: step.inputs?.body_template || '={{ $json.reply_text || $json.aiResponse || $json.message }}',
        },
        // No credentials — user assigns SMTP credential in n8n side panel
      }
    }

    case 'hubspot': {
      const reads = /get|fetch|pull|retrieve|read|ambil|mengambil|dapatkan/i.test(`${step.action} ${step.tool}`)
      return {
        ...baseNode,
        type: 'n8n-nodes-base.hubspot',
        typeVersion: 2,
        credentials: { hubspotApi: { id: '', name: 'HubSpot account' } },
        parameters: reads
          ? {
              resource: 'contact',
              operation: 'get',
              contactId: '={{ $json.customer_id || $json.contact_id || $json.id }}',
            }
          : {
              resource: 'contact',
              operation: 'create',
              properties: {
                email: '={{ $json.email || $json.customer_email }}',
                firstname: '={{ $json.first_name || $json.name }}',
                lastname: '={{ $json.last_name || "" }}',
              },
            },
      }
    }

    case 'zendesk': {
      return {
        ...baseNode,
        type: 'n8n-nodes-base.zendesk',
        typeVersion: 1,
        credentials: { zendeskApi: { id: '', name: 'Zendesk account' } },
        parameters: {
          resource: 'ticket',
          operation: 'create',
          subject: '={{ $json.subject || $json.title || "Aivory support ticket" }}',
          comment: '={{ $json.message || $json.description || $json.body || "" }}',
        },
      }
    }

    case 'asana': {
      return {
        ...baseNode,
        type: 'n8n-nodes-base.asana',
        typeVersion: 1,
        credentials: { asanaApi: { id: '', name: 'Asana account' } },
        parameters: {
          resource: 'task',
          operation: 'create',
          name: '={{ $json.task_name || $json.name || "Onboarding task" }}',
          notes: '={{ $json.description || $json.message || "" }}',
          workspace: '={{ $json.workspace_id || "" }}',
        },
      }
    }

    case 'messaging': {
      // Detect Slack specifically for native node
      const toolLower = (step.tool || '').toLowerCase()
      const actionLower = (step.action || '').toLowerCase()
      const isSlack = /slack/.test(toolLower) || /slack/.test(actionLower)

      if (isSlack) {
        return {
          ...baseNode,
          type: 'n8n-nodes-base.slack',
          typeVersion: 2,
          credentials: { slackApi: { id: '', name: 'Slack account' } },
          parameters: {
            resource: 'message',
            operation: 'send',
            channel: step.inputs?.channel || '#general',
            text: step.inputs?.text || '={{ $json.response || $json.body }}',
            otherOptions: {},
          },
        }
      }

      // Generic messaging (Discord, Telegram, WhatsApp, etc.) — use HTTP request
      return {
        ...baseNode,
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        parameters: {
          method: 'POST',
          url: step.inputs?.url || 'https://hooks.slack.com/services/YOUR_WEBHOOK',
          authentication: 'none',
          sendBody: true,
          specifyBody: 'json',
          jsonBody: JSON.stringify({ text: '={{ $json.response || $json.body }}' }, null, 2),
          options: {},
        },
      }
    }

    case 'http':
      return {
        ...baseNode,
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        parameters: {
          method: 'POST',
          url: step.inputs?.url || (step.unresolvedIntegration
            ? 'UNRESOLVED_INTEGRATION://configure-me'
            : 'https://api.example.com/endpoint'),
          authentication: 'none',
          ...(step.inputs?.headers?.length
            ? { sendHeaders: true, headerParameters: { parameters: step.inputs.headers.map((h: { name: string; value: string }) => ({ name: h.name, value: h.value })) } }
            : {}),
          sendBody: true,
          specifyBody: 'json',
          jsonBody: step.inputs?.jsonBody || '={{ JSON.stringify($json) }}',
          options: {},
        },
      }

    case 'schedule':
      return {
        ...baseNode,
        type: 'n8n-nodes-base.scheduleTrigger',
        typeVersion: 1,
        parameters: {
          rule: { interval: [{ field: 'hours', triggerAtHour: 9 }] },
        },
      }

    case 'rss':
      return {
        ...baseNode,
        type: 'n8n-nodes-base.rssFeedRead',
        typeVersion: 1.1,
        parameters: {
          url: step.inputs?.url || '',
        },
      }

    case 'transform':
      return {
        ...baseNode,
        type: 'n8n-nodes-base.set',
        typeVersion: 3,
        parameters: {
          assignments: {
            assignments: (step.assignments && step.assignments.length > 0)
              ? step.assignments.map((a) => ({ name: a.name, value: a.value, type: 'string' }))
              : [{ name: 'result', value: '={{ $json.response }}', type: 'string' }],
          },
          options: {},
        },
      }

    case 'database':
      return {
        ...baseNode,
        type: 'n8n-nodes-base.mySql',
        typeVersion: 2,
        parameters: {
          operation: 'executeQuery',
          query: step.inputs?.query || 'SELECT * FROM table_name LIMIT 10;',
        },
      }

    case 'calendar':
      return {
        ...baseNode,
        type: 'n8n-nodes-base.googleCalendar',
        typeVersion: 1.3,
        parameters: {
          operation: 'create',
          calendar: { mode: 'list', value: step.inputs?.calendar || 'primary' },
          start: step.inputs?.start || '={{ $json.start_time }}',
          end: step.inputs?.end || '={{ $json.end_time }}',
          additionalFields: { summary: step.action },
        },
        // No credentials — user attaches their Google Calendar OAuth2 credential in n8n
      }

    // Human-in-the-loop node: pauses the workflow until an external
    // approve/reject webhook call resumes it — n8n's standard mechanism for
    // manual review/approval gates (see n8n-nodes-base.wait, resume: webhook).
    case 'humanReview':
      return {
        ...baseNode,
        type: 'n8n-nodes-base.wait',
        typeVersion: 1.1,
        parameters: {
          resume: 'webhook',
          options: {},
        },
      }

    // Audit/log trail — appends a timestamped record via a Set node.
    // Deliberately not an AI node: recording what happened requires no
    // reasoning, only deterministic field assignment.
    case 'audit':
      return {
        ...baseNode,
        type: 'n8n-nodes-base.set',
        typeVersion: 3,
        parameters: {
          assignments: {
            assignments: [
              { name: 'audit_step', value: step.action, type: 'string' },
              { name: 'audit_logged_at', value: '={{ $now.toISO() }}', type: 'string' },
              { name: 'audit_status', value: '={{ $json.status || "completed" }}', type: 'string' },
            ],
          },
          options: {},
        },
      }

    case 'ftp':
      return {
        ...baseNode,
        type: 'n8n-nodes-base.ftp',
        typeVersion: 1,
        parameters: {
          operation: step.inputs?.operation || 'download',
          path: step.inputs?.path || '/remote/path/file.csv',
        },
      }

    case 'compress':
      return {
        ...baseNode,
        type: 'n8n-nodes-base.executeCommand',
        typeVersion: 1,
        parameters: {
          command: step.inputs?.command || 'zip -r archive.zip ./files',
        },
      }

    case 'ssh':
      return {
        ...baseNode,
        type: 'n8n-nodes-base.ssh',
        typeVersion: 1,
        parameters: {
          operation: 'execute',
          command: step.inputs?.command || 'ls -la',
        },
      }

    case 'cleanup':
      return {
        ...baseNode,
        type: 'n8n-nodes-base.executeCommand',
        typeVersion: 1,
        parameters: {
          command: step.inputs?.command || 'rm -rf /tmp/workflow_*',
        },
      }

    case 'ai':
    default: {
      // AI intent: consume previous node's output, not the webhook trigger.
      const inputExpr = `={{ JSON.stringify($json) }}`

      const wantsOpenAi = /openai|open\s*ai|\bgpt-?\d/i.test(`${step.tool || ''} ${step.action || ''}`)
      if (wantsOpenAi) {
        return {
          ...baseNode,
          type: 'n8n-nodes-base.openAi',
          typeVersion: 1.3,
          parameters: {
            resource: 'text',
            operation: 'message',
            modelId: { value: 'gpt-4o', mode: 'list' },
            messages: { values: [{ content: `${step.action}: ${inputExpr}`, role: 'user' }] },
            options: {},
          },
        }
      }

      // AI intent: POST to Zeroclaw with proper input expression
      return {
        ...baseNode,
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        parameters: {
          method: 'POST',
          url: ZEROCLAW_WEBHOOK_URL,
          authentication: 'none',
          sendBody: true,
          specifyBody: 'json',
          jsonBody: JSON.stringify({ message: `${step.action}: ${inputExpr}` }, null, 2),
          options: {},
        },
      }
    }
  }
}

/**
 * Build a native n8n AI Agent node + its linked Chat Model sub-node.
 * The sub-node connects to the Agent via the special `ai_languageModel`
 * connection type (not `main`) — that's how n8n wires LangChain sub-nodes.
 * Provider defaults to OpenAI; explicit "claude"/"anthropic" mentions switch
 * to Anthropic. The user can change the provider later from the inspector.
 */
function buildAiAgentStep(step: WorkflowStep, ctx: MapContext): MappedStepResult {
  const { stepIndex } = ctx
  const { name: nodeName, notes } = buildNodeName(stepIndex, step.action)
  const position: [number, number] = [250 + ((stepIndex + 1) * 220), 300]

  // Always consume the previous node's output ($json), never a hardcoded
  // reference to the Webhook Trigger — upstream ingestion/HTTP nodes exist
  // precisely to fetch and normalize data that the AI step should read.
  const inputExpr = `={{ JSON.stringify($json) }}`

  const isAnthropic = /claude|anthropic/i.test(`${step.tool || ''} ${step.action || ''}`)
  const modelNodeName = `${isAnthropic ? 'Anthropic' : 'OpenAI'} Chat Model${stepIndex > 0 ? ` ${stepIndex}` : ''}`

  let systemMessage = step.action || ''
  if (step.aiOutputSchema) {
    systemMessage += `\n\nYou must respond with valid JSON in this exact format (no other text):\n${JSON.stringify(step.aiOutputSchema, null, 2)}`
  }

  const agentNode: N8nNode = {
    id: generateNodeId(),
    name: nodeName,
    type: '@n8n/n8n-nodes-langchain.agent',
    typeVersion: 1.7,
    position,
    ...(notes ? { notes } : {}),
    parameters: {
      promptType: 'define',
      text: inputExpr,
      options: {
        systemMessage,
      },
      // AI governance metadata embedded in the node so it's visible in the
      // exported n8n JSON and can be audited without the planner source.
      ...(step.aiReasoning ? { aiReasoning: step.aiReasoning } : {}),
    },
  }

  const modelNode: N8nNode = {
    id: generateNodeId(),
    name: modelNodeName,
    type: isAnthropic ? '@n8n/n8n-nodes-langchain.lmChatAnthropic' : '@n8n/n8n-nodes-langchain.lmChatOpenAi',
    typeVersion: 1,
    position: [position[0], position[1] + 200],
    parameters: {
      model: { value: isAnthropic ? 'claude-3-5-sonnet-20241022' : 'gpt-4o', mode: 'list' },
      options: {},
    },
  }

  return {
    primary: agentNode,
    extraNodes: [modelNode],
    extraConnections: [{ from: modelNodeName, to: nodeName, type: 'ai_languageModel' }],
  }
}

/**
 * Map detected intent to one or more n8n nodes + any extra (non-`main`)
 * connections they need. This is the entry point workflow assembly should
 * use — `mapIntentToN8nNode()` above stays as the single-node primitive.
 */
export function mapIntentToN8nNodes(
  intent: NodeIntent,
  step: WorkflowStep,
  ctx: MapContext
): MappedStepResult {
  if (intent === 'ai') return buildAiAgentStep(step, ctx)
  return { primary: mapIntentToN8nNode(intent, step, ctx) }
}
