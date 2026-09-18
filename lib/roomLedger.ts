/**
 * Room ledger hint — pre-fetched mission-ledger state attached to room
 * payloads so agents see their own child-task status without spending a
 * task_list round-trip.
 *
 * Anti-loop role: the agent IDENTITY rules (Lex §7 done-is-terminal, Aira
 * finished-round-stays-finished) need to know the current ledger state to
 * fire. Without this hint the agent must call task_list first — an extra
 * round-trip per message — or worse, guess and re-execute finished work.
 * With it, a `done` child + no new work = text summary, zero tool calls.
 *
 * Best-effort by design: any fetch/parse failure yields null and the
 * payload is built exactly as before (the agent falls back to task_list).
 */
import { authedFetch } from "@/lib/deployAuth"
import type { LedgerTask } from "@/lib/airaTasks"

interface TasksResponse {
  tasks: LedgerTask[]
}

/** Latest task per agent_type in this session (by updated_at). */
export function latestByAgent(tasks: LedgerTask[]): Map<string, LedgerTask> {
  const byAgent = new Map<string, LedgerTask>()
  for (const t of tasks) {
    const prev = byAgent.get(t.agent_type)
    if (!prev || new Date(t.updated_at).getTime() >= new Date(prev.updated_at).getTime()) {
      byAgent.set(t.agent_type, t)
    }
  }
  return byAgent
}

/**
 * Build the `<ledger>` hint text for the agents answering this round.
 * Only agents with a row in this session are mentioned; others get no
 * line (unknown = behave as before, check task_list when in doubt).
 */
export function buildLedgerHint(
  tasks: LedgerTask[],
  targetAgentTypes: string[],
): string | null {
  const byAgent = latestByAgent(tasks)
  const lines: string[] = []
  for (const agentType of targetAgentTypes) {
    const t = byAgent.get(agentType)
    if (!t) continue
    const title = (t.title || "untitled").slice(0, 120)
    if (t.status === "done") {
      lines.push(
        `Your mission-ledger task "${title}" is done. ` +
          `If the user is not asking for genuinely new work, summarize the completed outcome in text with ZERO tool calls — do not re-execute it.`,
      )
    } else if (t.status === "blocked") {
      lines.push(
        `Your mission-ledger task "${title}" is blocked` +
          (t.blocked_reason ? `: ${t.blocked_reason.slice(0, 120)}` : `.`) +
          ` Continue or unblock it — do not create a duplicate task.`,
      )
    } else {
      lines.push(
        `Your mission-ledger task "${title}" is ${t.status} — continue that row, do not create a duplicate task.`,
      )
    }
  }
  return lines.length > 0 ? lines.join("\n") : null
}

/**
 * Fetch this session's ledger rows and build the hint for `targets`.
 * Never throws: returns null on any failure (auth, network, shape).
 */
export async function fetchLedgerHint(
  sessionId: string | null,
  targets: string[],
): Promise<string | null> {
  if (!sessionId || targets.length === 0) return null
  try {
    const r = await authedFetch(
      `/api/aira/tasks?session_id=${encodeURIComponent(sessionId)}&limit=50`,
    )
    if (!r.ok) return null
    const j = (await r.json()) as TasksResponse
    if (!j || !Array.isArray(j.tasks)) return null
    return buildLedgerHint(j.tasks, targets)
  } catch {
    return null
  }
}
