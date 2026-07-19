/**
 * Per-user report storage API (Phase 2, docs/DEEP-DIAGNOSTIC-RESULT-PLANNING.md).
 *
 * GET  /api/storage/:entity  → latest stored payload for the signed-in user, or null
 * POST /api/storage/:entity  → upsert `{ data }` for the signed-in user
 *
 * Auth is mandatory: user_id comes ONLY from the verified JWT
 * (lib/serverAuth.ts) — never from query params or the body. Tables live in
 * the `dashboard` schema (migrations/dashboard-storage.sql).
 */
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUser, type AuthUser } from '@/lib/serverAuth'

export const runtime = 'nodejs'

/** Fixed entity → table map; table names are never interpolated from input. */
const TABLES: Record<string, string> = {
  context: 'dashboard.diagnostic_contexts',
  diagnostic: 'dashboard.diagnostic_results',
  blueprint: 'dashboard.blueprints',
  roadmap: 'dashboard.roadmaps',
}

function authenticate(request: NextRequest): { user: AuthUser } | { response: NextResponse } {
  let user: AuthUser | null
  try {
    user = getAuthUser(request)
  } catch (err) {
    console.error('[api/storage] auth misconfiguration:', err)
    return { response: NextResponse.json({ error: 'Storage unavailable' }, { status: 500 }) }
  }
  if (!user) {
    return { response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  }
  return { user }
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ entity: string }> }
) {
  const { entity } = await ctx.params
  const table = TABLES[entity]
  if (!table) return NextResponse.json({ error: 'Invalid entity' }, { status: 400 })

  const auth = authenticate(request)
  if ('response' in auth) return auth.response

  try {
    const result = await query(`SELECT data FROM ${table} WHERE user_id = $1`, [auth.user.user_id])
    return NextResponse.json(result.rows[0]?.data ?? null)
  } catch (err) {
    console.error(`[api/storage/${entity}] GET failed:`, err)
    return NextResponse.json({ error: 'Storage unavailable' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ entity: string }> }
) {
  const { entity } = await ctx.params
  const table = TABLES[entity]
  if (!table) return NextResponse.json({ error: 'Invalid entity' }, { status: 400 })

  const auth = authenticate(request)
  if ('response' in auth) return auth.response

  let data: unknown
  try {
    const body = await request.json()
    data = (body as Record<string, unknown>)?.data
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (data === null || typeof data !== 'object') {
    return NextResponse.json({ error: 'Missing data payload' }, { status: 400 })
  }

  try {
    await query(
      `INSERT INTO ${table} (user_id, data) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [auth.user.user_id, JSON.stringify(data)]
    )
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(`[api/storage/${entity}] POST failed:`, err)
    return NextResponse.json({ error: 'Storage unavailable' }, { status: 500 })
  }
}
