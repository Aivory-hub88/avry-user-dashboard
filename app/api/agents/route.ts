import { NextRequest, NextResponse } from 'next/server'

/**
 * /api/agents
 * Thin proxy to the backend agents service so the workflow Agent picker and the
 * "new agent" form work. Forwards the user's bearer token.
 *   GET  ?status=active  -> { agents: [...] }
 *   POST { ...agent }    -> created agent
 */
export const runtime = 'nodejs'

const BACKEND = (
  process.env.BACKEND_SERVICE_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://avry-backend:8081'
).replace(/\/$/, '')

function token(req: NextRequest): string {
  return (
    req.cookies.get('aivory_access_token')?.value ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''
  )
}

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') || ''
  const qs = status ? `?status=${encodeURIComponent(status)}` : ''
  try {
    const res = await fetch(`${BACKEND}/api/v1/agents${qs}`, {
      headers: { Authorization: `Bearer ${token(req)}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      // Graceful: empty list rather than breaking the picker
      return NextResponse.json({ agents: [] })
    }
    const data = await res.json().catch(() => ({}))
    const agents = Array.isArray(data) ? data : data?.agents ?? data?.data ?? []
    return NextResponse.json({ agents })
  } catch {
    return NextResponse.json({ agents: [] })
  }
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  try {
    const res = await fetch(`${BACKEND}/api/v1/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(req)}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create agent' },
      { status: 502 },
    )
  }
}
