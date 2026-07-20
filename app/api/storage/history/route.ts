/**
 * Assessment history read API (Phase E1.3,
 * docs/OPS-TRANSFORMATION-NARRATIVE-BRIEF.md §8).
 *
 * GET /api/storage/history → recent diagnostic_history snapshots for the
 * signed-in user, newest first, capped at HISTORY_LIMIT — this feeds a
 * delta chip + sparkline (E2.3), not a full audit log.
 *
 * Read-only by design: history rows are written exclusively as a side
 * effect of POST /api/storage/context (app/api/storage/[entity]/route.ts).
 * There is no POST here — nothing writes into this append table directly
 * from the client, matching E-invariant 3 (never write back into stored
 * context; history is an independent log, not something callers append to
 * arbitrarily).
 *
 * Auth is mandatory and identical to the sibling route: user_id comes ONLY
 * from the verified JWT (lib/serverAuth.ts) — never from a query param or
 * body. Table lives in the `dashboard` schema
 * (migrations/dashboard-storage.sql).
 */
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUser } from '@/lib/serverAuth'
import type { DiagnosticHistoryEntry } from '@/types/diagnostic'

export const runtime = 'nodejs'

const HISTORY_LIMIT = 12

export async function GET(request: NextRequest) {
  let user
  try {
    user = getAuthUser(request)
  } catch (err) {
    console.error('[api/storage/history] auth misconfiguration:', err)
    return NextResponse.json({ error: 'Storage unavailable' }, { status: 500 })
  }
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const result = await query(
      `SELECT data, created_at FROM dashboard.diagnostic_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [user.user_id, HISTORY_LIMIT]
    )
    const entries: DiagnosticHistoryEntry[] = result.rows.map((row) => ({
      data: row.data,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    }))
    return NextResponse.json(entries)
  } catch (err) {
    console.error('[api/storage/history] GET failed:', err)
    return NextResponse.json({ error: 'Storage unavailable' }, { status: 500 })
  }
}
