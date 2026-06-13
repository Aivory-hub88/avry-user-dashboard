import { NextRequest } from 'next/server'
import { getConfig } from '@/lib/config'

// FIXED: TIMEOUT INCREASE — 120s to match bridge + Zeroclaw timeout
export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { session_id, messages, context } = body

    if (!session_id || !Array.isArray(messages) || messages.length === 0) {
      return Response.json(
        { error: true, message: 'session_id and messages are required' },
        { status: 400 }
      )
    }

    const config = getConfig()
    // Route through /aria/stream — correct thin-proxy endpoint
    const bridgeUrl = `${config.VPS_BRIDGE_URL}/aria/stream`

    // FIXED: TIMEOUT INCREASE — abort after 115s
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 115000)

    let bridgeResponse: Response
    try {
      // Strip sensitive fields before forwarding to bridge — defense in depth
      const safeContext: Record<string, unknown> = {}
      if (context?.page) safeContext.page = context.page
      if (context?.mode) safeContext.mode = context.mode
      if (context?.source_tab) safeContext.source_tab = context.source_tab
      if (context?.roadmap) safeContext.roadmap = context.roadmap
      // Explicitly exclude: session_id, organization_id, pageContext internals

      bridgeResponse = await fetch(bridgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messages.filter((m: { role: string }) => m.role === 'user').at(-1)?.content ?? '',
          context: { history: messages, ...safeContext }
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!bridgeResponse.ok) {
      let msg = 'Bridge error'
      try { const e = await bridgeResponse.json(); msg = e.message || e.detail || msg } catch { /* ignore */ }
      return Response.json({ error: true, message: msg }, { status: bridgeResponse.status })
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

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return Response.json({ error: true, message: 'Request timed out' }, { status: 504 })
    }
    console.error('[aira/ask] error:', error)
    // Return specific error message for context tab fix as per requirements
    return Response.json(
      { error: true, message: 'Aivory tidak dapat membaca context tab ini. Coba refresh halaman.' },
      { status: 400 }
    )
  }
}