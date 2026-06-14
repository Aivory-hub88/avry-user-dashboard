/**
 * POST /api/workflows/clarify
 *
 * Dedicated proxy for workflow clarification requests.
 * Forwards to VPS Bridge → /workflows/clarify → Zeroclaw.
 *
 * Request body:
 *   {
 *     session_id:            string   (required)
 *     organization_id:       string   (required)
 *     user_request:          string   (required)
 *     conversation_history?: array    (optional)
 *   }
 *
 * Success response (200):
 *   { message: string }
 *
 * Error response:
 *   { error: { code: string, message: string, details?: string } }
 */

import { NextRequest, NextResponse } from 'next/server'

// ── Config ────────────────────────────────────────────────────────────────────

const VPS_BRIDGE_URL = (
  process.env.VPS_BRIDGE_URL ||
  process.env.NEXT_PUBLIC_VPS_BRIDGE_URL ||
  'http://43.156.108.96:3003'
).replace(/\/$/, '')

const UPSTREAM_PATH = '/console/stream'
const TIMEOUT_MS    = 30_000   // 30s — route through Zeroclaw webhook

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClarifyRequestBody {
  session_id:            string
  organization_id:       string
  user_request:          string
  conversation_history?: unknown[]
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── 1. Parse & validate body ──────────────────────────────────────────────
  let body: ClarifyRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } },
      { status: 400 }
    )
  }

  const { session_id, organization_id, user_request, conversation_history } = body

  if (!session_id || typeof session_id !== 'string') {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'session_id is required' } },
      { status: 400 }
    )
  }
  if (!organization_id || typeof organization_id !== 'string') {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'organization_id is required' } },
      { status: 400 }
    )
  }
  if (!user_request || typeof user_request !== 'string') {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'user_request is required' } },
      { status: 400 }
    )
  }

  // ── 2. Log incoming request ───────────────────────────────────────────────
  console.log('[/api/workflows/clarify] incoming request', {
    session_id,
    organization_id,
    user_request_length: user_request.length,
    has_history: Array.isArray(conversation_history) && conversation_history.length > 0,
  })

  // ── 3. Proxy to VPS Bridge ────────────────────────────────────────────────
  // /workflows/clarify doesn't exist on Zeroclaw — route through /console/stream
  // which proxies to Zeroclaw's /webhook endpoint
  const targetUrl = `${VPS_BRIDGE_URL}${UPSTREAM_PATH}`

  const upstreamBody: Record<string, unknown> = {
    message: user_request,
    session_id,
    organization_id,
    context: {
      mode: 'workflow_clarify',
      source_tab: 'workflows',
      history: Array.isArray(conversation_history) ? conversation_history : [],
    },
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // ── Log outgoing VPS call ─────────────────────────────────────────────────
  console.log('[/api/workflows/clarify] upstream config', {
    vpsUrl:    targetUrl,
    timeoutMs: TIMEOUT_MS,
  })
  console.log('[/api/workflows/clarify] → VPS', {
    session_id,
    organization_id,
    user_request_length: user_request.length,
  })
  const t0 = Date.now()
  let bridgeResponse: Response
  try {
    bridgeResponse = await fetch(targetUrl, {
      method:  'POST',
      headers,
      body:    JSON.stringify(upstreamBody),
      signal:  AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err: unknown) {
    const elapsed   = Date.now() - t0
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    const details   = err instanceof Error ? err.message : String(err)

    console.error('[/api/workflows/clarify] upstream error', {
      cause:     details,
      isTimeout,
      elapsedMs: elapsed,
      timeoutMs: TIMEOUT_MS,
    })

    return NextResponse.json(
      {
        error: {
          code:    'GATEWAY_ERROR',
          message: isTimeout
            ? `Workflow gateway timed out after ${TIMEOUT_MS}ms`
            : 'Failed to contact workflow gateway',
          details,
        },
      },
      { status: 502 }
    )
  }

  // ── 4. Log upstream status ────────────────────────────────────────────────
  console.log('[/api/workflows/clarify] ← VPS', {
    status:    bridgeResponse.status,
    elapsedMs: Date.now() - t0,
    url:       targetUrl,
  })

  // ── 5. Parse upstream response ────────────────────────────────────────────
  const rawText = await bridgeResponse.text()
  let parsed: unknown = null
  try {
    parsed = rawText ? JSON.parse(rawText) : null
  } catch {
    parsed = null
  }

  // ── 6. Forward error from VPS Bridge ─────────────────────────────────────
  if (!bridgeResponse.ok) {
    // If VPS Bridge returned a structured error, forward it
    if (
      parsed &&
      typeof parsed === 'object' &&
      'error' in (parsed as Record<string, unknown>)
    ) {
      return NextResponse.json(parsed, { status: bridgeResponse.status })
    }

    // Otherwise wrap in our standard error shape
    const message =
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Record<string, unknown>).message === 'string'
        ? (parsed as Record<string, unknown>).message as string
        : rawText || `VPS Bridge returned ${bridgeResponse.status}`

    return NextResponse.json(
      {
        error: {
          code:    'UPSTREAM_ERROR',
          message,
          details: `HTTP ${bridgeResponse.status} from ${UPSTREAM_PATH}`,
        },
      },
      { status: bridgeResponse.status }
    )
  }

  // ── 7. Return success ─────────────────────────────────────────────────────
  // Zeroclaw returns { model, response } — normalize to { message } for callers
  const responseText =
    parsed &&
    typeof parsed === 'object' &&
    typeof (parsed as Record<string, unknown>).response === 'string'
      ? (parsed as Record<string, unknown>).response as string
      : rawText || ''

  console.log('[/api/workflows/clarify] success, message_length:', responseText.length)
  return NextResponse.json({ message: responseText }, { status: 200 })
}
