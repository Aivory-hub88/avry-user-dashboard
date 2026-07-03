/**
 * bridgeCopilot — server-only client for the VPS Bridge copilot operations.
 *
 * Single source of truth for how copilot operations (clarify / generate /
 * repair / edit / draft-test) are sent to the VPS Bridge and how the SSE
 * responses are buffered and normalized into workflow shapes.
 *
 * Consumed by:
 *   - lib/workflows/copilotStateMachine.ts  (direct in-process call — the
 *     state machine only ever runs inside a Next.js API route, so it must
 *     NOT loop back through its own public URL to reach the bridge; that
 *     round trip previously went container → Cloudflare → Traefik → same
 *     container, adding seconds of latency and an external dependency to
 *     what is logically an internal function call)
 *   - app/api/copilot/[...path]/route.ts    (thin HTTP wrapper so browser
 *     code can reach the same operations)
 */

const VPS_BRIDGE_URL = (
  process.env.VPS_BRIDGE_URL ||
  process.env.NEXT_PUBLIC_VPS_BRIDGE_URL ||
  ''
).replace(/\/$/, '')

export type CopilotOperation =
  | 'clarify'
  | 'generate'
  | 'repair'
  | 'edit'
  | 'draft-test'

const TIMEOUT_MS = 120_000

// ── SSE helpers ──────────────────────────────────────────────────────────────

/**
 * Parse a raw SSE body (multiple `data: {...}` events) into concatenated
 * chunk text plus any error event payload.
 */
export function bufferSseBody(raw: string): { text: string; error: string | null; eventCount: number } {
  if (!raw) return { text: '', error: null, eventCount: 0 }

  let text = ''
  let error: string | null = null
  let eventCount = 0

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.startsWith('data:')) continue

    const payload = trimmed.slice(5).trim()
    if (!payload || payload === '[DONE]') continue

    try {
      const event = JSON.parse(payload) as Record<string, unknown>
      eventCount++
      if (event.type === 'chunk' && typeof event.content === 'string') {
        text += event.content
      } else if (event.type === 'error' && typeof event.error === 'string') {
        error = event.error
      } else if (event.type === 'error' && event.error && typeof event.error === 'object') {
        const msg = (event.error as Record<string, unknown>).message
        if (typeof msg === 'string') error = msg
      }
    } catch {
      text += payload
    }
  }

  return { text, error, eventCount }
}

export function isSsePayload(raw: string): boolean {
  if (!raw) return false
  return raw.includes('data:') && raw.includes('\n')
}

// ── Normalize Zeroclaw response → workflow shape ─────────────────────────────

export function normalizeZeroclawToWorkflow(
  text: string,
  fallbackName: string,
): { workflow: Record<string, unknown>; message: string } {
  const trimmed = (text || '').trim()

  const looksLikeWorkflow = (obj: unknown): obj is Record<string, unknown> =>
    !!obj && typeof obj === 'object' &&
    typeof (obj as Record<string, unknown>).workflowName === 'string'

  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (looksLikeWorkflow(parsed)) {
        return { workflow: parsed, message: trimmed }
      }
      if (
        parsed && typeof parsed === 'object' &&
        'workflow' in parsed &&
        looksLikeWorkflow((parsed as Record<string, unknown>).workflow)
      ) {
        return {
          workflow: (parsed as Record<string, unknown>).workflow as Record<string, unknown>,
          message: typeof (parsed as Record<string, unknown>).message === 'string'
            ? (parsed as Record<string, unknown>).message as string
            : trimmed,
        }
      }
    } catch {
      // Fall through
    }
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch && fenceMatch[1]) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim()) as unknown
      if (looksLikeWorkflow(parsed)) {
        return { workflow: parsed, message: trimmed }
      }
      if (
        parsed && typeof parsed === 'object' &&
        'workflow' in parsed &&
        looksLikeWorkflow((parsed as Record<string, unknown>).workflow)
      ) {
        return {
          workflow: (parsed as Record<string, unknown>).workflow as Record<string, unknown>,
          message: trimmed,
        }
      }
    } catch {
      // Continue
    }
  }

  // Embedded JSON substring — first balanced {...} block
  if (trimmed) {
    const start = trimmed.indexOf('{')
    if (start >= 0) {
      let depth = 0
      let inString = false
      let escape = false
      for (let i = start; i < trimmed.length; i++) {
        const ch = trimmed[i]
        if (escape) { escape = false; continue }
        if (ch === '\\' && inString) { escape = true; continue }
        if (ch === '"') { inString = !inString; continue }
        if (inString) continue
        if (ch === '{') depth++
        else if (ch === '}') {
          depth--
          if (depth === 0) {
            const candidate = trimmed.slice(start, i + 1)
            try {
              const parsed = JSON.parse(candidate) as unknown
              if (looksLikeWorkflow(parsed)) {
                return { workflow: parsed, message: trimmed }
              }
            } catch {
              // Continue scanning
            }
            break
          }
        }
      }
    }
  }

  return {
    workflow: {
      workflowName: fallbackName,
      steps: [],
      estimate_hours: 2,
      automation_score: 0.8,
      summary: trimmed || `${fallbackName} — no content returned`,
    },
    message: trimmed,
  }
}

// ── Outbound body builders (mirrors what the bridge/Zeroclaw expects) ────────

// Canonical workflow JSON schema — kept in sync with the bridge's wfSchema
// (server.js, workflow_* entrypoints) and GeneratedWorkflowStep. "app" names
// the integration so sandbox MCP node resolution has a concrete service to
// match against instead of guessing from the title text.
const WORKFLOW_JSON_HINT =
  '\n\n[IMPORTANT: Respond ONLY with a single JSON object matching this schema, ' +
  'no prose, no markdown fences: ' +
  '{"workflowName": string, "steps": [{"id": string, "type": "trigger"|"action"|"condition"|"channel", "app": string, "action": string, "title": string, "description": string, "config": object}], ' +
  '"estimate_hours": number, "automation_score": number, "summary": string}. ' +
  '"app" is the lowercase integration/service (e.g. slack, gmail, hubspot, webhook, schedule); "action" is the operation. ' +
  'The first step must be type "trigger".]'

function buildOutbound(op: CopilotOperation, bodyRecord: Record<string, unknown>): { targetPath: string; outbound: unknown } {
  const history = Array.isArray(bodyRecord.conversation_history)
    ? bodyRecord.conversation_history
    : []

  switch (op) {
    case 'clarify':
      return {
        targetPath: '/console/stream',
        outbound: {
          message: bodyRecord.user_request ?? '',
          session_id: bodyRecord.session_id ?? 'copilot',
          organization_id: bodyRecord.organization_id ?? 'default',
          mode: 'console',
          channel: 'console_ui',
          entrypoint: 'workflow_clarify',
          context: {
            mode: 'workflow_clarify',
            source_tab: 'workflows',
            history,
          },
          history,
        },
      }
    case 'generate':
      return {
        targetPath: '/console/stream',
        outbound: {
          message: (bodyRecord.user_request ?? '') + WORKFLOW_JSON_HINT,
          history,
          mode: 'console',
          channel: 'console_ui',
          entrypoint: 'workflow_generate',
          context: {
            session_id: bodyRecord.session_id,
            organization_id: bodyRecord.organization_id,
          },
        },
      }
    case 'repair':
      return {
        targetPath: '/console/stream',
        outbound: {
          message: `Repair these failed steps: ${JSON.stringify(bodyRecord.failed_steps)}. Current workflow: ${JSON.stringify(bodyRecord.current_workflow)}${WORKFLOW_JSON_HINT}`,
          history: [],
          mode: 'console',
          channel: 'console_ui',
          entrypoint: 'workflow_repair',
          context: {
            session_id: bodyRecord.session_id,
            organization_id: bodyRecord.organization_id,
          },
        },
      }
    case 'edit':
      return {
        targetPath: '/console/stream',
        outbound: {
          message: (bodyRecord.edit_request ?? bodyRecord.user_request ?? '') + WORKFLOW_JSON_HINT,
          history: [],
          mode: 'console',
          channel: 'console_ui',
          entrypoint: 'workflow_edit',
          context: {
            session_id: bodyRecord.session_id,
            organization_id: bodyRecord.organization_id,
            current_workflow: bodyRecord.current_workflow,
          },
        },
      }
    case 'draft-test':
      return {
        targetPath: '/workflows/draft-test',
        outbound: bodyRecord,
      }
  }
}

// ── Main entry point ─────────────────────────────────────────────────────────

export class BridgeCopilotError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/**
 * Execute a copilot operation against the VPS Bridge and normalize the result.
 * Returns the same JSON shapes the /api/copilot/* proxy responds with:
 *   clarify              → { message }
 *   generate/repair/edit → { workflow, message }
 *   draft-test           → bridge JSON as-is
 * Throws BridgeCopilotError on upstream failure.
 */
export async function callCopilotOperation(
  op: CopilotOperation,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!VPS_BRIDGE_URL) {
    // Fail hard — no hardcoded fallback host (the old fallback pointed at the
    // retired, compromised VPS).
    throw new BridgeCopilotError('VPS_BRIDGE_URL is not configured', 500)
  }

  const { targetPath, outbound } = buildOutbound(op, body)
  const targetUrl = `${VPS_BRIDGE_URL}${targetPath}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  const t0 = Date.now()
  let bridgeResponse: Response
  try {
    bridgeResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(outbound),
      signal: controller.signal,
    })
  } catch (error: unknown) {
    const isTimeout = error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')
    throw new BridgeCopilotError(
      isTimeout
        ? `VPS Bridge timeout after ${TIMEOUT_MS}ms — ${op} took too long.`
        : `Failed to reach VPS Bridge: ${error instanceof Error ? error.message : String(error)}`,
      502,
    )
  } finally {
    clearTimeout(timeoutId)
  }

  const rawBody = await bridgeResponse.text()
  console.log(`[bridgeCopilot] ${op}`, {
    status: bridgeResponse.status,
    elapsedMs: Date.now() - t0,
    bytes: rawBody.length,
  })

  if (!bridgeResponse.ok) {
    let errorMsg: string = rawBody || `VPS Bridge error ${bridgeResponse.status}`
    try {
      const parsedErr = JSON.parse(rawBody)
      if (parsedErr && typeof parsedErr === 'object' && typeof parsedErr.message === 'string') {
        errorMsg = parsedErr.message
      }
    } catch {
      // Use raw body
    }
    throw new BridgeCopilotError(errorMsg, bridgeResponse.status)
  }

  const isSse = isSsePayload(rawBody)
  let responseText = ''

  if (isSse) {
    const buffered = bufferSseBody(rawBody)
    if (buffered.error) {
      throw new BridgeCopilotError(`Zeroclaw error: ${buffered.error}`, 502)
    }
    responseText = buffered.text
  } else {
    responseText = rawBody
  }

  let parsed: unknown = null
  if (!isSse && responseText) {
    try {
      parsed = JSON.parse(responseText)
    } catch {
      parsed = null
    }
  }

  if (op === 'clarify') {
    const msg =
      parsed && typeof parsed === 'object' && typeof (parsed as Record<string, unknown>).message === 'string'
        ? (parsed as Record<string, unknown>).message as string
        : parsed && typeof parsed === 'object' && typeof (parsed as Record<string, unknown>).response === 'string'
        ? (parsed as Record<string, unknown>).response as string
        : responseText
    return { message: msg }
  }

  if (op === 'generate' || op === 'repair' || op === 'edit') {
    if (parsed && typeof parsed === 'object') {
      const p = parsed as Record<string, unknown>
      if (p.workflow && typeof p.workflow === 'object') {
        return p
      }
    }
    const fallbackName = op === 'generate'
      ? 'Generated Workflow'
      : op === 'repair'
      ? 'Repaired Workflow'
      : 'Edited Workflow'
    return normalizeZeroclawToWorkflow(responseText, fallbackName)
  }

  // draft-test and other pass-through operations
  if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  try {
    return JSON.parse(responseText) as Record<string, unknown>
  } catch {
    return {}
  }
}
