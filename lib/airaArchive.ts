/**
 * Finished ledger tasks, read back from Cerveau's archive.
 *
 * Cerveau moves a task out of `cerveau.agent_tasks` the moment it is marked
 * `done` and stores it, gzip-compressed as JSON, in `cerveau.agent_tasks_archive`
 * (kept 40 days). The live table therefore only ever holds open work, and a
 * board that reads it alone can never show anything as Done. This module turns
 * archive payloads back into `LedgerTask`s so the board and the room ledger
 * hint can see finished work again.
 *
 * Pure and server-side only (node:zlib). The SQL lives in the route so it stays
 * next to the live query it mirrors.
 */
import { gunzipSync } from 'node:zlib'
import type { LedgerTask } from '@/lib/airaTasks'

/** Cerveau prunes the archive after 40 days; asking for more is pointless. */
export const ARCHIVE_RETENTION_DAYS = 40
/** How far back the board looks by default. */
export const DONE_WINDOW_DAYS_DEFAULT = 14
/** Upper bound on archive rows decoded per request. */
export const ARCHIVE_ROW_CAP = 100

export function clampDoneDays(raw: string | null): number {
  const n = parseInt(raw ?? '', 10)
  if (!Number.isFinite(n) || n < 1) return DONE_WINDOW_DAYS_DEFAULT
  return Math.min(n, ARCHIVE_RETENTION_DAYS)
}

/**
 * Decode one archive payload. Returns null for anything that is not a usable
 * task (corrupt gzip, not JSON, missing identity fields): one bad archive row
 * must never hide the others, exactly as on the Cerveau side.
 */
export function decodeArchivedTask(payload: unknown): LedgerTask | null {
  if (!payload || !(payload instanceof Uint8Array)) return null
  let raw: unknown
  try {
    raw = JSON.parse(gunzipSync(payload).toString('utf8'))
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>
  const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0
  if (!str(t.task_id) || !str(t.tenant_id) || !str(t.agent_type) || !str(t.created_at)) return null
  const optional = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

  const task: LedgerTask = {
    task_id: t.task_id,
    tenant_id: t.tenant_id,
    agent_type: t.agent_type,
    session_id: optional(t.session_id),
    title: typeof t.title === 'string' ? t.title : '',
    // Everything in the archive is finished by construction, whatever an
    // older payload's own field says.
    status: 'done',
    priority: typeof t.priority === 'string' ? t.priority : 'normal',
    blocked_reason: null,
    created_at: t.created_at,
    // `updated_at` is the moment it was marked done.
    updated_at: str(t.updated_at) ? t.updated_at : t.created_at,
  }
  // Delegation link (Cerveau ADR-014 A2) — present only on delegated tasks.
  const delegatedBy = optional(t.delegated_by)
  const delegationId = optional(t.delegation_id)
  const resultSummary = optional(t.result_summary)
  if (delegatedBy) task.delegated_by = delegatedBy
  if (delegationId) task.delegation_id = delegationId
  if (resultSummary) task.result_summary = resultSummary
  return task
}

export interface ArchiveFilters {
  tenantId: string
  sessionId: string | null
}

/**
 * Decode a batch of archive payloads and apply the filters SQL cannot: the
 * archive table has no session column (it lives inside the payload), and the
 * tenant is re-checked here as a second line of defence behind the SQL scope.
 */
export function decodeArchivedTasks(payloads: unknown[], filters: ArchiveFilters): LedgerTask[] {
  const out: LedgerTask[] = []
  for (const p of payloads) {
    const task = decodeArchivedTask(p)
    if (!task) continue
    if (task.tenant_id !== filters.tenantId) continue
    if (filters.sessionId && task.session_id !== filters.sessionId) continue
    out.push(task)
  }
  return out
}
