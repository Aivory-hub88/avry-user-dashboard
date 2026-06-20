import { NextRequest, NextResponse } from 'next/server'
import { getConfig } from '@/lib/config'

const FALLBACK = NextResponse.json(
  { rawagentresponse: '{"route":"console","confidence":0,"reason":"Staying in Console","tabLabel":"Console"}' },
  { status: 200 }
)

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  console.log('[/api/intent] POST received, body:', JSON.stringify(body).slice(0, 300))
  const config = getConfig()
  const bridgeUrl = config.VPS_BRIDGE_URL

  try {
    // 8s hard timeout — intent classification is best-effort, never blocks the user
    const res = await fetch(`${bridgeUrl}/aivory-assistant/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: body.message ?? '',
        session_id: 'intent-classifier',
        organization_id: 'default',
        context: body.context ?? {},
      }),
      signal: AbortSignal.timeout(8000),
    })

    console.log('[/api/intent] bridge response status:', res.status, res.statusText)

    if (!res.ok) {
      // Non-2xx from bridge → silent fallback, never 503
      return FALLBACK
    }

    // Parse SSE stream to extract the final content
    const reader = res.body?.getReader()
    if (!reader) {
      console.log('[/api/intent] no response body')
      return FALLBACK
    }

    let raw = ''
    const decoder = new TextDecoder()
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            // Extract content from SSE format
            const content = data?.content || data?.choices?.[0]?.delta?.content || ''
            if (content) {
              raw += content
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }

    console.log('[/api/intent] extracted raw from SSE:', raw.slice(0, 200))

    if (!raw) return FALLBACK

    return NextResponse.json({ rawagentresponse: raw }, { status: 200 })
  } catch (err) {
    console.log('[/api/intent] error:', err)
    // Timeout, network error, parse error → silent fallback, never 503
    return FALLBACK
  }
}
