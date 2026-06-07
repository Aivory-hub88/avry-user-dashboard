/**
 * Universal workflow node mapping engine.
 * Detects intent from step action text and maps to appropriate n8n node.
 *
 * Intents: email, messaging, http, respond, filter, transform, schedule,
 *          compress, ssh, cleanup, ai (default)
 */

export type NodeIntent =
  | 'email'
  | 'messaging'
  | 'http'
  | 'database'
  | 'ftp'
  | 'compress'
  | 'ssh'
  | 'cleanup'
  | 'respond'
  | 'filter'
  | 'transform'
  | 'schedule'
  | 'ai'

export const ZEROCLAW_WEBHOOK_URL = process.env.ZEROCLAW_WEBHOOK_URL || 'http://43.156.108.96:3003/webhook'

// Intent detection patterns (priority order matters)
// NOTE: Use \b word boundaries for short words like "if", "ai" to avoid substring matches
// e.g. "notification" contains "if", "classify" contains "if"
const INTENT_PATTERNS: Record<NodeIntent, RegExp> = {
  respond: /\brespond\b|return\b|send.*response|reply\b|deliver.*result|webhook.*response|final.*output/i,
  filter: /condition|\bif\b|decision|\bcheck\b|\bflag\b|\bfilter\b|validate|validation|branch|switch/i,
  email: /email|mail\b|smtp|inbox/i,
  messaging: /slack|discord|telegram|whatsapp|\bsms\b|\bteams\b/i,
  schedule: /schedule|cron|daily|hourly|weekly|timer|interval/i,
  http: /\bhttp\b|\bapi\b|request\b|fetch\b|call.*endpoint|webhook.*call|post.*to|get.*from/i,
  transform: /transform|convert|format\b|parse\b|extract\b|set.*value/i,
  database: /mysql|postgres|postgresql|sql\b|database|db\b|query|insert|select.*from/i,
  ftp: /ftp|sftp|file.*transfer|upload.*file|download.*file|file.*server/i,
  compress: /compress|zip\b|tar\b|gzip|rar\b|archive|unzip|extract.*file|decompress/i,
  ssh: /\bssh\b|\bscp\b|\bexec\b|remote.*command|run.*command|shell\b|execute.*server/i,
  cleanup: /delete\b|remove\b|cleanup|clean.*up|purge\b|clear\b|truncate|drop\b|erase\b/i,
  ai: /\bai\b|\bllm\b|analyze|process\b|generate\b|summarize|classify|nlp|\bgpt\b|claude|qwen/i,
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
  if (INTENT_PATTERNS.messaging.test(text)) return 'messaging'
  if (INTENT_PATTERNS.respond.test(text)) return 'respond'
  if (INTENT_PATTERNS.filter.test(text)) return 'filter'
  if (INTENT_PATTERNS.schedule.test(text)) return 'schedule'
  if (INTENT_PATTERNS.http.test(text)) return 'http'
  if (INTENT_PATTERNS.database.test(text)) return 'database'
  if (INTENT_PATTERNS.ftp.test(text)) return 'ftp'
  if (INTENT_PATTERNS.compress.test(text)) return 'compress'
  if (INTENT_PATTERNS.ssh.test(text)) return 'ssh'
  if (INTENT_PATTERNS.cleanup.test(text)) return 'cleanup'
  if (INTENT_PATTERNS.transform.test(text)) return 'transform'
  if (INTENT_PATTERNS.ai.test(text)) return 'ai'

  // Default to AI for any unrecognized step
  return 'ai'
}

interface WorkflowStep {
  step: number
  action: string
  tool: string
  output: string
  inputs?: { url?: string; [key: string]: any }
}

interface N8nNode {
  name: string
  type: string
  typeVersion: number
  position: [number, number]
  parameters: Record<string, any>
  id?: string
  credentials?: Record<string, { id: string; name: string }>
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
  const nodeName = `Step ${stepIndex + 1}: ${step.action.substring(0, 40)}`
  const position: [number, number] = [250 + ((stepIndex + 1) * 220), 300]
  const id = generateNodeId()

  const baseNode = { id, name: nodeName, position }

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

    case 'filter':
      return {
        ...baseNode,
        type: 'n8n-nodes-base.if',
        typeVersion: 2,
        parameters: {
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
            conditions: [
              {
                leftValue: '={{ $json.response }}',
                rightValue: '',
                operator: { type: 'string', operation: 'isNotEmpty' },
              },
            ],
            combinator: 'and',
          },
        },
      }

    case 'email':
      // n8n Send Email node — schema from n8n-MCP (typeVersion 2.1).
      // Credentials intentionally omitted — user assigns SMTP credential
      // manually in n8n side panel after activation.
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
          url: step.inputs?.url || 'https://api.example.com/endpoint',
          authentication: 'none',
          sendBody: true,
          specifyBody: 'json',
          jsonBody: '={{ JSON.stringify($json) }}',
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

    case 'transform':
      return {
        ...baseNode,
        type: 'n8n-nodes-base.set',
        typeVersion: 3,
        parameters: {
          assignments: {
            assignments: [
              { name: 'result', value: '={{ $json.response }}', type: 'string' },
            ],
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
      // AI intent: POST to Zeroclaw with proper input expression
      const inputExpr = aiNodeCount === 0
        ? '={{ $("Webhook Trigger").item.json.body }}'
        : '={{ $json.response }}'

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