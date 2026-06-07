/**
 * Canonical n8n node payload protocol for Aivory → n8n conversion.
 *
 * RULES:
 *   trigger → Webhook node with auto-generated path
 *   ai      → HTTP Request POST to Zeroclaw with { "message": "..." }
 *   filter  → IF node with conditions
 *   action  → Respond to Webhook with JSON body
 *
 * CRITICAL RULES:
 *   - NEVER use step.action as Zeroclaw message body
 *   - AI nodes MUST reference actual data from previous nodes via n8n expressions
 *   - First AI step after trigger: use {{ $('Webhook Trigger').item.json.body }}
 *   - Subsequent AI steps: use {{ $json.response }}
 *   - Final action/response nodes MUST use respondToWebhook, NEVER HTTP Request
 *   - Steps containing "send response", "return", "respond", "send email" → action role
 */

export const ZEROCLAW_WEBHOOK_URL = process.env.ZEROCLAW_WEBHOOK_URL || 'http://43.156.108.96:3003/webhook'

export type NodeRole = 'trigger' | 'ai' | 'filter' | 'action'

export const NODE_PROTOCOL = {
  trigger: {
    n8nType: 'n8n-nodes-base.webhook',
    typeVersion: 1,
    parameters: {
      httpMethod: 'POST',
      path: '{{AUTO_GENERATED}}',
      responseMode: 'responseNode',
    },
  },
  ai: {
    n8nType: 'n8n-nodes-base.httpRequest',
    typeVersion: 4,
    parameters: {
      method: 'POST',
      url: ZEROCLAW_WEBHOOK_URL,
      authentication: 'none',
      sendBody: true,
      specifyBody: 'json',
      // jsonBody is built at conversion time using n8n expressions,
      // NEVER using step.action as literal message content.
    },
  },
  filter: {
    n8nType: 'n8n-nodes-base.if',
    typeVersion: 2,
    parameters: {},
  },
  action: {
    n8nType: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1,
    parameters: {
      respondWith: 'json',
      // responseBody is built at conversion time using n8n expressions
    },
  },
} as const

/** Regex to detect steps that should be respondToWebhook (action role). */
const RESPONSE_STEP_RE = /send response|return result|respond|webhook response|send email|send notification|send alert|deliver|reply/i

/**
 * Classify an Aivory workflow step into a NodeRole.
 *
 * Priority:
 *   1. Decision / condition / check / filter / validate → 'filter'
 *   2. Response / send / return / email keywords → 'action' (respondToWebhook)
 *   3. Last step in the chain → 'action'
 *   4. Everything else → 'ai' (HTTP POST to Zeroclaw)
 */
export function classifyStep(action: string, tool: string, isLast: boolean): NodeRole {
  const text = `${action} ${tool}`.toLowerCase()

  // Filter / decision nodes
  if (
    text.includes('condition') || text.includes('if') || text.includes('decision') ||
    text.includes('check') || text.includes('flag') || text.includes('filter') ||
    text.includes('validate') || text.includes('validation')
  ) {
    return 'filter'
  }

  // Response / send / return → always respondToWebhook, never HTTP Request
  if (RESPONSE_STEP_RE.test(text)) {
    return 'action'
  }

  // Last step defaults to action (respond to caller)
  if (isLast) return 'action'

  return 'ai'
}
