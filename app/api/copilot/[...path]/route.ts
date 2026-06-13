/**
 * /app/api/copilot/[...path]/route.ts
 *
 * Server-side proxy: browser → /api/copilot/* → VPS Bridge
 * Solves CORS — browser tidak pernah langsung menyentuh VPS Bridge.
 *
 * Endpoints yang diproxy:
 *   POST /api/copilot/workflows/clarify       (SSE buffered → { message })
 *   POST /api/copilot/workflows/generate      (SSE buffered → { workflow, message })
 *   POST /api/copilot/workflows/repair        (SSE buffered → { workflow, message })
 *   POST /api/copilot/workflows/edit          (SSE buffered → { workflow, message })
 *   POST /api/copilot/workflows/draft-test    (direct → n8n-as-code)
 *
 * FIXED (2026-05): VPS Bridge /console/stream returns SSE events
 * (`data: {"type":"chunk","content":"..."}\n\n ... data: {"type":"done"}\n\n`).
 * The previous implementation did `response.text()` + `JSON.parse`, which
 * fails for multi-event SSE payloads. We now buffer the SSE stream,
 * concatenate all `chunk` content, and normalize the resulting string into
 * the workflow shape expected by copilotStateMachine.
 *
 * Auth: VPS Bridge runs internal-only (network isolation).
 * No API key or internal token is sent — the bridge does not validate them.
 */

import { NextRequest, NextResponse } from 'next/server'

const VPS_BRIDGE_URL = (
  process.env.VPS_BRIDGE_URL ||
  process.env.NEXT_PUBLIC_VPS_BRIDGE_URL ||
  'http://43.156.108.96:3003'
).replace(/\/$/, '')

// n8n-as-code service URL (used for draft-test)
const N8N_AS_CODE_URL = (
  process.env.N8N_AS_CODE_URL || 'http://43.156.108.96:3500'
).replace(/\/$/, '')

// Per-endpoint timeouts (ms).
const TIMEOUT_BY_PATH: Record<string, number> = {
  '/workflows/clarify':    120_000,
  '/workflows/generate':   120_000,
  '/workflows/repair':     120_000,
  '/workflows/edit':       120_000,
  '/workflows/draft-test': 120_000,
}
const DEFAULT_TIMEOUT_MS = 120_000

// Whitelist — only allow known copilot endpoints
const ALLOWED_PATHS = [
  '/workflows/clarify',
  '/workflows/generate',
  '/workflows/repair',
  '/workflows/edit',
  '/workflows/draft-test',
]

// ── SSE helpers ─────────────────────────────────────────────────────────────

/**
 * Parse a raw SSE body (multiple `data: {...}\n\n` events) into a single
 * concatenated text string by appending all `chunk` content fields. Also
 * returns any `error` event payloads so upstream can surface them.
 */
function bufferSseBody(raw: string): { text: string; error: string | null; eventCount: number } {
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
      // Non-JSON data: treat the raw payload as plain text chunk
      text += payload
    }
  }

  return { text, error, eventCount }
}

/**
 * Looks at the raw bridge body and decides whether it is SSE (contains
 * `data:` lines) or a plain JSON body. SSE takes priority because VPS Bridge
 * always writes SSE for the /console/stream path.
 */
function isSsePayload(raw: string): boolean {
  if (!raw) return false
  // Cheap check that avoids regex backtracking on long bodies.
  return raw.includes('data:') && raw.includes('\n')
}

// ── Normalize Zeroclaw response → workflow shape ─────────────────────────────
/**
 * Zeroclaw returns natural language or JSON inside the SSE stream. We try to
 * extract a workflow JSON object from the concatenated text; if that fails we
 * build a minimal placeholder so the UI doesn't crash.
 *
 * Common shapes we try to parse, in priority order:
 *   1. Raw JSON object with `workflowName`: `{ "workflowName": "...", "steps": [...] }`
 *   2. Wrapped JSON: `{ "workflow": { "workflowName": "...", ... } }`
 *   3. Fenced code block: ```json\n{ "workflowName": "..." }\n```
 *   4. Embedded JSON substring (first `{` to matching `}`)
 *   5. Plain text fallback → `{ workflowName: fallbackName, steps: [], summary: text }`
 */
function normalizeZeroclawToWorkflow(
  text: string,
  fallbackName: string,
): { workflow: Record<string, unknown>; message: string } {
  const trimmed = (text || '').trim()

  // Helper: validate that a parsed object looks like a workflow
  const looksLikeWorkflow = (obj: unknown): obj is Record<string, unknown> =>
    !!obj && typeof obj === 'object' &&
    typeof (obj as Record<string, unknown>).workflowName === 'string'

  // 1 & 2: try parsing the whole text as JSON
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (looksLikeWorkflow(parsed)) {
        return { workflow: parsed, message: trimmed }
      }
      // Wrapped: { workflow: {...} }
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
      // Fall through to other strategies
    }
  }

  // 3: fenced JSON code block
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

  // 4: embedded JSON substring — find the first balanced `{...}` block and try
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

  // 5: plain text fallback — surface the text as summary so the user sees
  // Zeroclaw's natural-language reply even if it couldn't be parsed as workflow.
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params
  const path = '/' + pathSegments.join('/')

  if (!ALLOWED_PATHS.includes(path)) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 })
  }

  const bodyRecord = body && typeof body === 'object' ? body as Record<string, unknown> : {}

  // ── Determine effective target URL and outbound body per endpoint ─────────
  const isClarify   = path === '/workflows/clarify'
  const isGenerate  = path === '/workflows/generate'
  const isRepair    = path === '/workflows/repair'
  const isEdit      = path === '/workflows/edit'
  const isDraftTest = path === '/workflows/draft-test'

  let effectiveTargetUrl: string
  let outboundBody: unknown

  if (isClarify) {
    // Zeroclaw only handles requests via /console/stream (webhook)
    effectiveTargetUrl = `${VPS_BRIDGE_URL}/console/stream`
    outboundBody = {
      message: bodyRecord.user_request ?? '',
      session_id: bodyRecord.session_id ?? 'copilot',
      organization_id: bodyRecord.organization_id ?? 'default',
      context: {
        mode: 'workflow_clarify',
        source_tab: 'workflows',
        history: Array.isArray(bodyRecord.conversation_history)
          ? bodyRecord.conversation_history
          : [],
      },
    }
  } else if (isGenerate) {
    effectiveTargetUrl = `${VPS_BRIDGE_URL}/console/stream`
    // System prompt appended to user_request to coax JSON workflow output.
    const workflowJsonHint =
      '\n\n[IMPORTANT: Respond ONLY with a single JSON object matching this schema, ' +
      'no prose, no markdown fences: ' +
      '{"workflowName": string, "steps": [{"id": string, "type": string, "title": string, "description": string, "config": object}], ' +
      '"estimate_hours": number, "automation_score": number, "summary": string}]'
    outboundBody = {
      message: (bodyRecord.user_request ?? '') + workflowJsonHint,
      history: Array.isArray(bodyRecord.conversation_history)
        ? bodyRecord.conversation_history
        : [],
      mode: 'console',
      channel: 'console_ui',
      entrypoint: 'workflow_generate',
      context: {
        session_id: bodyRecord.session_id,
        organization_id: bodyRecord.organization_id,
      },
    }
  } else if (isRepair) {
    effectiveTargetUrl = `${VPS_BRIDGE_URL}/console/stream`
    const repairJsonHint =
      '\n\n[IMPORTANT: Respond ONLY with a single JSON object matching this schema: ' +
      '{"workflowName": string, "steps": [...], "estimate_hours": number, "automation_score": number, "summary": string}]'
    outboundBody = {
      message: `Repair these failed steps: ${JSON.stringify(bodyRecord.failed_steps)}. Current workflow: ${JSON.stringify(bodyRecord.current_workflow)}${repairJsonHint}`,
      history: [],
      mode: 'console',
      channel: 'console_ui',
      entrypoint: 'workflow_repair',
      context: {
        session_id: bodyRecord.session_id,
        organization_id: bodyRecord.organization_id,
      },
    }
  } else if (isEdit) {
    effectiveTargetUrl = `${VPS_BRIDGE_URL}/console/stream`
    const editJsonHint =
      '\n\n[IMPORTANT: Respond ONLY with a single JSON object matching the workflow schema: ' +
      '{"workflowName": string, "steps": [...], "estimate_hours": number, "automation_score": number, "summary": string}]'
    outboundBody = {
      message: (bodyRecord.edit_request ?? bodyRecord.user_request ?? '') + editJsonHint,
      history: [],
      mode: 'console',
      channel: 'console_ui',
      entrypoint: 'workflow_edit',
      context: {
        session_id: bodyRecord.session_id,
        organization_id: bodyRecord.organization_id,
        current_workflow: bodyRecord.current_workflow,
      },
    }
  } else if (isDraftTest) {
    // draft-test goes to the VPS Bridge, which orchestrates
    // build → test → report against n8n-as-code (localhost-only on the VPS)
    // and returns the BridgeDraftTestResponse shape the state machine expects.
    // NOTE: must NOT hit n8n-as-code directly — it is not reachable from the
    // dockerized console; only the bridge can reach it.
    effectiveTargetUrl = `${VPS_BRIDGE_URL}/workflows/draft-test`
    outboundBody = body // pass through as-is (workflowId, description, steps)
  } else {
    effectiveTargetUrl = `${VPS_BRIDGE_URL}${path}`
    outboundBody = body
  }

  const timeoutMs = TIMEOUT_BY_PATH[path] ?? DEFAULT_TIMEOUT_MS

  // VPS Bridge is internal-only — no auth headers needed
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // ── Log outgoing request ──────────────────────────────────────────────────
  console.log(`[/api/copilot${path}] → VPS`, {
    targetUrl: effectiveTargetUrl,
    timeoutMs,
    session_id:          bodyRecord.session_id ?? null,
    organization_id:     bodyRecord.organization_id ?? null,
    user_request_length: typeof bodyRecord.user_request === 'string'
      ? bodyRecord.user_request.length
      : null,
    history_length: Array.isArray(bodyRecord.conversation_history)
      ? bodyRecord.conversation_history.length
      : null,
  })

  const t0 = Date.now()

  try {
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), timeoutMs)

    let bridgeResponse: Response
    try {
      bridgeResponse = await fetch(effectiveTargetUrl, {
        method:  'POST',
        headers,
        body:    JSON.stringify(outboundBody),
        signal:  controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    const elapsed = Date.now() - t0
    console.log(`[/api/copilot${path}] ← VPS`, {
      status:    bridgeResponse.status,
      elapsedMs: elapsed,
    })

    const rawBody = await bridgeResponse.text()

    if (!bridgeResponse.ok) {
      // On error status, try JSON parse first, fall back to raw body
      let errorMsg: string = rawBody || `VPS Bridge error ${bridgeResponse.status}`
      try {
        const parsedErr = JSON.parse(rawBody)
        if (parsedErr && typeof parsedErr === 'object' && typeof parsedErr.message === 'string') {
          errorMsg = parsedErr.message
        }
      } catch {
        // Not JSON — use raw body as error message
      }

      console.error(`[/api/copilot${path}] upstream error`, {
        status:    bridgeResponse.status,
        elapsedMs: elapsed,
        message:   errorMsg.slice(0, 300),
      })

      return NextResponse.json(
        { message: errorMsg },
        { status: bridgeResponse.status }
      )
    }

    // ── Normalize response ────────────────────────────────────────────────

    // Determine if payload is SSE (from /console/stream) or plain JSON
    const isSse = isSsePayload(rawBody)

    let responseText = ''
    let sseError: string | null = null

    if (isSse) {
      const buffered = bufferSseBody(rawBody)
      responseText = buffered.text
      sseError = buffered.error
      console.log(`[/api/copilot${path}] buffered SSE`, {
        eventCount: buffered.eventCount,
        textLength: responseText.length,
        sseError,
      })

      if (sseError) {
        return NextResponse.json(
          { message: `Zeroclaw error: ${sseError}` },
          { status: 502 }
        )
      }
    } else {
      // Plain JSON body (non-SSE endpoints like draft-test, or future /workflows/generate)
      responseText = rawBody
    }

    // Try to parse responseText as JSON for plain-JSON endpoints
    let parsed: unknown = null
    if (!isSse && responseText) {
      try {
        parsed = JSON.parse(responseText)
      } catch {
        parsed = null
      }
    }

    // Clarify: return { message } with the plain text
    if (isClarify) {
      const msg =
        parsed && typeof parsed === 'object' && typeof (parsed as Record<string, unknown>).message === 'string'
          ? (parsed as Record<string, unknown>).message as string
          : parsed && typeof parsed === 'object' && typeof (parsed as Record<string, unknown>).response === 'string'
          ? (parsed as Record<string, unknown>).response as string
          : responseText
      console.log(`[/api/copilot${path}] clarify message_length:`, msg.length)
      return NextResponse.json({ message: msg }, { status: 200 })
    }

    // Generate / Repair / Edit: return { workflow, message }
    if (isGenerate || isRepair || isEdit) {
      // If the JSON response already contains a workflow, use it directly.
      if (parsed && typeof parsed === 'object') {
        const p = parsed as Record<string, unknown>
        if (p.workflow && typeof p.workflow === 'object') {
          console.log(`[/api/copilot${path}] passthrough workflow:`, (p.workflow as Record<string, unknown>).workflowName)
          return NextResponse.json(p, { status: 200 })
        }
      }

      const fallbackName = isGenerate
        ? 'Generated Workflow'
        : isRepair
        ? 'Repaired Workflow'
        : 'Edited Workflow'
      const normalized = normalizeZeroclawToWorkflow(responseText, fallbackName)
      console.log(`[/api/copilot${path}] normalized response → workflow:`, {
        workflowName: normalized.workflow.workflowName,
        stepCount: Array.isArray(normalized.workflow.steps) ? (normalized.workflow.steps as unknown[]).length : 0,
      })
      return NextResponse.json(normalized, { status: 200 })
    }

    // draft-test and other pass-through endpoints: return parsed JSON as-is
    return NextResponse.json(parsed ?? {}, { status: 200 })
  } catch (error: unknown) {
    const elapsed    = Date.now() - t0
    const isTimeout  = error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')
    const errMessage = error instanceof Error ? error.message : String(error)

    console.error(`[/api/copilot${path}] fetch error`, {
      isTimeout,
      elapsedMs: elapsed,
      timeoutMs,
      cause:     errMessage,
    })

    return NextResponse.json(
      {
        message: isTimeout
          ? `VPS Bridge timeout after ${timeoutMs}ms — ${path} terlalu lama.`
          : `Gagal menghubungi VPS Bridge: ${errMessage}`,
      },
      { status: 502 }
    )
  }
}
