/**
 * Phase 3B Task Contract — pure helpers for the Aira orchestration ledger.
 *
 * The zeroclaw task tools (task_create / task_update_status) have fixed
 * schemas — title, status, priority, blocked_reason only — so the contract
 * is convention + derivation, not new columns:
 *
 * - Parent: the earliest chief_of_staff task in a room session. Aira titles
 *   it `AIRA-orch-<UTC ts>: <objective>` (see its IDENTITY.md protocol).
 * - Children: every other agent_type task in the same session. Specialists
 *   update only their own rows, never the parent.
 * - Status vocabulary: todo=planned, in_progress=running,
 *   blocked (blocked_reason required — approval waits land here), done.
 * - Timeout is derived, not stored: open tasks older than their SLA surface
 *   as overdue for human-driven enforcement (consistent with the
 *   approval-gated philosophy — no background canceller).
 */

export interface LedgerTask {
  task_id: string
  tenant_id: string
  agent_type: string
  session_id: string | null
  title: string
  status: string
  priority: string
  blocked_reason: string | null
  created_at: string
  updated_at: string
}

export interface EnrichedTask extends LedgerTask {
  is_parent: boolean
  overdue: boolean
  elapsed_ms: number
}

export interface Orchestration {
  session_id: string
  parent: EnrichedTask | null
  children: EnrichedTask[]
  overdue_count: number
  open_count: number
}

/** Child task SLA: room rounds are interactive, 15 min without movement = stuck. */
export const CHILD_SLA_MINUTES = 15
/** Parent orchestration SLA: synthesis across delegates may legitimately take longer. */
export const PARENT_SLA_MINUTES = 60

export function taskAgeMs(t: Pick<LedgerTask, 'created_at'>, now = Date.now()): number {
  const created = new Date(t.created_at).getTime()
  if (Number.isNaN(created)) return 0
  return Math.max(0, now - created)
}

export function isTaskOverdue(
  t: Pick<LedgerTask, 'status' | 'created_at'>,
  isParent: boolean,
  now = Date.now(),
): boolean {
  if (t.status === 'done') return false
  const slaMs = (isParent ? PARENT_SLA_MINUTES : CHILD_SLA_MINUTES) * 60_000
  return taskAgeMs(t, now) > slaMs
}

export function enrichTask(t: LedgerTask, isParent: boolean, now = Date.now()): EnrichedTask {
  return {
    ...t,
    is_parent: isParent,
    overdue: isTaskOverdue(t, isParent, now),
    elapsed_ms: taskAgeMs(t, now),
  }
}

/**
 * Group flat ledger rows into per-session orchestrations. Sessions without
 * any chief_of_staff row still group (parent: null) so specialist-only
 * activity remains visible. Rows without a session_id each stand alone.
 */
export function groupIntoOrchestrations(tasks: LedgerTask[], now = Date.now()): Orchestration[] {
  const bySession = new Map<string, LedgerTask[]>()
  const unscoped: LedgerTask[] = []
  for (const t of tasks) {
    if (t.session_id) {
      const list = bySession.get(t.session_id) ?? []
      list.push(t)
      bySession.set(t.session_id, list)
    } else {
      unscoped.push(t)
    }
  }

  const out: Orchestration[] = []
  for (const [sessionId, rows] of bySession) {
    const sorted = [...rows].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    const parentRow = sorted.find((r) => r.agent_type === 'chief_of_staff') ?? null
    const parent = parentRow ? enrichTask(parentRow, true, now) : null
    const children = sorted
      .filter((r) => r !== parentRow)
      .map((r) => enrichTask(r, false, now))
    const all = [...(parent ? [parent] : []), ...children]
    out.push({
      session_id: sessionId,
      parent,
      children,
      overdue_count: all.filter((t) => t.overdue).length,
      open_count: all.filter((t) => t.status !== 'done').length,
    })
  }
  for (const t of unscoped) {
    const enriched = enrichTask(t, t.agent_type === 'chief_of_staff', now)
    out.push({
      session_id: '',
      parent: enriched.is_parent ? enriched : null,
      children: enriched.is_parent ? [] : [enriched],
      overdue_count: enriched.overdue ? 1 : 0,
      open_count: enriched.status !== 'done' ? 1 : 0,
    })
  }
  return out
}
