/**
 * Server-side storage and run limit for the free analysis
 * (dashboard.free_analyses, migrations/dashboard-free-analysis.sql).
 *
 * Node runtime only. user_id must come from the verified JWT.
 */

import { query, withTransaction } from '@/lib/db'
import type { StoredFreeAnalysis } from './scoring'

/**
 * Completed free analyses per account. Matches the "2 analyses" the free
 * signup promised. It is scored in code with no LLM, so the limit only exists
 * to keep the free tier a preview of the paid analysis, not to cap cost.
 */
export const FREE_ANALYSIS_LIMIT = 2

export interface FreeAnalysisStatus {
  latest: StoredFreeAnalysis | null
  used: number
  limit: number
  remaining: number
}

function status(latest: StoredFreeAnalysis | null, used: number): FreeAnalysisStatus {
  return { latest, used, limit: FREE_ANALYSIS_LIMIT, remaining: Math.max(0, FREE_ANALYSIS_LIMIT - used) }
}

export async function getFreeAnalysisStatus(userId: string): Promise<FreeAnalysisStatus> {
  const res = await query(
    `SELECT data, (SELECT count(*) FROM dashboard.free_analyses WHERE user_id = $1)::int AS used
       FROM dashboard.free_analyses WHERE user_id = $1
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [userId],
  )
  const row = res.rows[0]
  return status(row ? (row.data as StoredFreeAnalysis) : null, row ? Number(row.used) : 0)
}

export type RecordResult =
  | { ok: true; status: FreeAnalysisStatus }
  | { ok: false; status: FreeAnalysisStatus }

/**
 * Appends a run if the account has one left. A per-user advisory lock makes
 * the count-then-insert atomic, so two tabs finishing at once cannot both
 * slip past the limit.
 */
export async function recordFreeAnalysis(userId: string, data: StoredFreeAnalysis): Promise<RecordResult> {
  return withTransaction(async tx => {
    await tx(`SELECT pg_advisory_xact_lock(hashtext('free_analyses:' || $1))`, [userId])
    const counted = await tx(`SELECT count(*)::int AS used FROM dashboard.free_analyses WHERE user_id = $1`, [userId])
    const used = Number(counted.rows[0]?.used ?? 0)
    if (used >= FREE_ANALYSIS_LIMIT) {
      const latest = await tx(
        `SELECT data FROM dashboard.free_analyses WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
        [userId],
      )
      return { ok: false as const, status: status((latest.rows[0]?.data as StoredFreeAnalysis) ?? null, used) }
    }
    await tx(`INSERT INTO dashboard.free_analyses (user_id, data) VALUES ($1, $2)`, [userId, JSON.stringify(data)])
    return { ok: true as const, status: status(data, used + 1) }
  })
}
