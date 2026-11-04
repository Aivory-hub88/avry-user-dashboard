import { NextRequest, NextResponse } from 'next/server'
import { getConfig } from '@/lib/config'
import { requireModule } from '@/lib/teamAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function userIdFromAuth(req: NextRequest): string | null {
  const h = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!h) return null
  const parts = h.split(' ')
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1].split('.')[1] || '', 'base64').toString())
    return (payload.user_id || payload.sub || payload.id || null) as string | null
  } catch { return null }
}

export async function POST(req: NextRequest) {
  const denied = await requireModule(req, 'console')
  if (denied) return denied
  try {
    const body = await req.json()

    const headerUserId = userIdFromAuth(req)
    const organization_id = body.organization_id ?? 'default'
    const user_id = headerUserId ?? body.user_id ?? body.userId ?? 'console-user'
    const session_id = body.session_id ?? body.sessionId ?? 'console-session'

    const messages =
      Array.isArray(body.messages) && body.messages.length > 0
        ? body.messages
        : body.message
          ? [{ role: 'user', content: String(body.message) }]
          : []

    if (!messages.length) {
      return NextResponse.json(
        { error: true, message: 'Missing messages' },
        { status: 400 }
      )
    }

    const config = getConfig()
    // FIXED: Use /console/stream on VPS Bridge (thin proxy) which forwards to Zeroclaw /webhook
    // Previous code used /bridge/aivory-assistant which doesn't exist in thin-proxy server.js
    const bridgeUrl = `${config.VPS_BRIDGE_URL}/console/stream`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 115000)

    let bridgeResponse: Response
    try {
      const bridgePayload = {
        message: messages.filter((m: { role: string }) => m.role === 'user').at(-1)?.content ?? '',
        history: messages.length > 0 && messages[messages.length - 1].role === 'user' ? messages.slice(0, -1) : messages,
        mode: 'console',
        channel: 'console_ui',
        entrypoint: 'console',
        context: {
          session_id,
          organization_id,
          user_id,
          page: 'console',
          source_tab: 'console',
          user_state: body.user_state || null,
        },
      }
      if (process.env.NODE_ENV === 'development') {
        console.log('[console/stream] bridgeUrl:', bridgeUrl)
      }

      bridgeResponse = await fetch(bridgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bridgePayload),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!bridgeResponse.ok) {
      let msg = 'Bridge error'
      try { const e = await bridgeResponse.json(); msg = e.message || e.detail || msg } catch { /* ignore */ }
      return NextResponse.json({ error: true, message: msg }, { status: bridgeResponse.status })
    }

    // The bridge already speaks SSE: hand its byte stream straight to the client. No
    // decode/re-encode and no pump loop in between, so every upstream write reaches the
    // browser as it happens, and a client that goes away cancels the upstream request too.
    return new Response(bridgeResponse.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        // no-transform keeps compression middleware from buffering the stream;
        // X-Accel-Buffering does the same for any nginx-style proxy in front.
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error: any) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: true, message: 'Request timed out' }, { status: 504 })
    }
    console.error('[console/stream] error:', error)
    return NextResponse.json(
      {
        error: 'VPSBridgeError',
        message: error?.message || 'Internal error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
