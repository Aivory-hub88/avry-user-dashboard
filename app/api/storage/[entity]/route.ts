/**
 * Per-user report storage API (Phase 2, docs/DEEP-DIAGNOSTIC-RESULT-PLANNING.md).
 *
 * GET  /api/storage/:entity  → latest stored payload for the signed-in user, or null
 * POST /api/storage/:entity  → upsert `{ data }` for the signed-in user
 *
 * Auth is mandatory: user_id comes ONLY from the verified JWT
 * (lib/serverAuth.ts) — never from query params or the body. Tables live in
 * the `dashboard` schema (migrations/dashboard-storage.sql).
 *
 * Phase E1.3 (docs/OPS-TRANSFORMATION-NARRATIVE-BRIEF.md §8): every
 * successful POST to the `context` entity also appends a lean snapshot to
 * dashboard.diagnostic_history (see insertHistorySnapshot below). That
 * insert is best-effort — it must never fail the primary upsert, and it
 * never mutates the diagnostic_contexts row (E-invariant 3). The `history`
 * entity itself is read-only and served by the sibling static route
 * app/api/storage/history/route.ts (Next.js resolves that literal segment
 * ahead of this [entity] catch-all).
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

const DIMENSION_KEYS = ['strategy', 'data', 'process', 'people', 'governance', 'security'] as const

/**
 * Extracts the lean history snapshot from a saved `context` payload —
 * composite + maturity + per-dimension scores only, never the full
 * DiagnosticContext (qualitative answers, opportunities, risks, etc. stay
 * out of the append table by design). Returns null when the payload doesn't
 * look like a DiagnosticContext with scores, so a malformed/legacy body
 * simply skips the history insert instead of writing garbage.
 */
function extractHistorySnapshot(data: unknown): Record<string, unknown> | null {
  if (data === null || typeof data !== 'object') return null
  const scores = (data as Record<string, unknown>).scores
  if (scores === null || typeof scores !== 'object') return null
  const s = scores as Record<string, unknown>
  if (typeof s.composite !== 'number' || typeof s.maturityLevel !== 'string') return null

  const dimensions: Record<string, number> = {}
  for (const key of DIMENSION_KEYS) {
    if (typeof s[key] === 'number') dimensions[key] = s[key] as number
  }

  return { composite: s.composite, maturityLevel: s.maturityLevel, dimensions }
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
  } catch (err) {
    console.error(`[api/storage/${entity}] POST failed:`, err)
    return NextResponse.json({ error: 'Storage unavailable' }, { status: 500 })
  }

  // Phase E1.3 — append a lean snapshot to the history table alongside the
  // primary upsert. Deliberately outside the try/catch above: the upsert has
  // already succeeded and returned by this point in spirit, so any failure
  // here is logged and swallowed rather than surfaced as a save failure.
  if (entity === 'context') {
    const snapshot = extractHistorySnapshot(data)
    if (snapshot) {
      try {
        await query(
          `INSERT INTO dashboard.diagnostic_history (user_id, data) VALUES ($1, $2)`,
          [auth.user.user_id, JSON.stringify(snapshot)]
        )
      } catch (err) {
        console.error('[api/storage/context] history insert failed (non-fatal):', err)
      }
    }
  }

  return NextResponse.json({ success: true })
}
