import { NextRequest, NextResponse } from 'next/server'
import { getConfig } from '@/lib/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const organization_id = body.organization_id ?? 'test-org'
    const user_id = body.user_id ?? body.userId ?? 'console-user'
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
    // Previous code used /bridge/aira which doesn't exist in thin-proxy server.js
    const bridgeUrl = `${config.VPS_BRIDGE_URL}/console/stream`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 115000)

    let bridgeResponse: Response
    try {
      const bridgePayload = {
        message: messages.filter((m: { role: string }) => m.role === 'user').at(-1)?.content ?? '',
        history: messages,
        mode: 'console',
        channel: 'console_ui',
        entrypoint: 'console',
        context: {
          session_id,
          organization_id,
          user_id,
          page: 'console',
          source_tab: 'console',
        },
      }
      console.log('[debug] bridgeUrl:', bridgeUrl)
      console.log('[debug] bridgePayload:', JSON.stringify(bridgePayload).substring(0, 500))

      bridgeResponse = await fetch(bridgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bridgePayload),
        signal: controller.signal,
      })
      console.log('[debug] bridgeResponse status:', bridgeResponse.status, 'content-type:', bridgeResponse.headers.get('content-type'))
    } finally {
      clearTimeout(timeoutId)
    }

    if (!bridgeResponse.ok) {
      let msg = 'Bridge error'
      try { const e = await bridgeResponse.json(); msg = e.message || e.detail || msg } catch { /* ignore */ }
      return NextResponse.json({ error: true, message: msg }, { status: bridgeResponse.status })
    }

    // Bridge now returns proper SSE format - forward it directly to client
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    const reader = bridgeResponse.body!.getReader()
    const decoder = new TextDecoder()

    ;(async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = decoder.decode(value, { stream: true })
          await writer.write(new TextEncoder().encode(chunk))
        }
      } finally {
        try { await writer.close() } catch { /* already closed */ }
      }
    })()

    return new NextResponse(readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
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
