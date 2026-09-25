"use client"
/**
 * Mission Timeline — Phase 3C kanban over the Phase 3B task ledger.
 *
 * Cards are never dragged (services/cerveau/TASK-CONTRACT.md): status moves
 * through approvals. Two things act from here, both through existing APIs:
 * - Waiting also lists pending approvals (the same feed as the agent
 *   avatars' badge), resolvable in place. A parked chat turn never writes a
 *   ledger row, so without this an agent could show "17" on its avatar
 *   while the board showed nothing waiting.
 * - An open task can be stopped (PATCH /api/aira/tasks/[id], the same
 *   escape hatch as Console's "Stuck tasks"), e.g. a row an agent opened
 *   "pending approval" with no approval behind it.
 *
 * Two variants share one fetcher:
 * - compact: MissionControl section (top cards per column + link to /missions)
 * - full:    /missions page (every card, 4-column board)
 */
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { authedFetch } from "@/lib/deployAuth"
import { relativeTime } from "@/lib/officeRows"
import type { EnrichedTask, Orchestration } from "@/lib/airaTasks"
import { useAgentApprovals } from "@/hooks/useAgentApprovals"
import {
  describeTool,
  notifyApprovalsChanged,
  readVerifierFinding,
  type PendingApproval,
} from "@/lib/agentApprovals"
import { AGENT_NAMES, isAgentType } from "@/lib/agentRoster"

type Status = "todo" | "in_progress" | "blocked" | "done"

const COLUMNS: { key: Status; title: string; hint: string }[] = [
  { key: "todo", title: "Planned", hint: "todo" },
  { key: "in_progress", title: "Running", hint: "in_progress" },
  { key: "blocked", title: "Waiting", hint: "blocked = approval / input" },
  { key: "done", title: "Done", hint: "done" },
]

interface TasksResponse {
  tasks: EnrichedTask[]
  columns: Record<Status, EnrichedTask[]>
  counts: Record<Status | "total", number>
  orchestrations: Orchestration[]
  sla: { child_minutes: number; parent_minutes: number }
}

function formatElapsed(ms: number): string {
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return "<1m"
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ${mins % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

function shortSession(id: string | null): string {
  if (!id) return "no session"
  return id.length > 18 ? `${id.slice(0, 10)}…${id.slice(-6)}` : id
}

const OPEN_STATUSES = new Set(["todo", "in_progress", "blocked"])

const PRESSABLE = "transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] disabled:opacity-50"

async function stopTask(taskId: string): Promise<void> {
  const r = await authedFetch(`/api/aira/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "stop" }),
  })
  // 409 = already terminal: the board is just stale, not an error.
  if (!r.ok && r.status !== 409) throw new Error(`HTTP ${r.status}`)
}

/** Two-step so a stray click never ends someone's task. */
function StopControl({ taskId, onStopped }: { taskId: string; onStopped: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={`rounded-full px-2 py-0.5 text-[10.5px] text-white/40 hover:bg-white/[0.06] hover:text-white/75 ${PRESSABLE}`}
      >
        Stop task
      </button>
    )
  }
  return (
    <span className="flex items-center gap-1.5">
      {error && <span className="text-[10.5px] text-red-300/80">{error}</span>}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await stopTask(taskId)
            onStopped()
          } catch {
            setError("Couldn't stop it")
            setBusy(false)
          }
        }}
        className={`rounded-full bg-red-400/15 px-2 py-0.5 text-[10.5px] font-medium text-red-200 hover:bg-red-400/25 ${PRESSABLE}`}
      >
        {busy ? "Stopping…" : "Confirm stop"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setConfirming(false)
          setError(null)
        }}
        className={`rounded-full px-2 py-0.5 text-[10.5px] text-white/45 hover:bg-white/[0.06] hover:text-white/75 ${PRESSABLE}`}
      >
        Keep
      </button>
    </span>
  )
}

function agentLabel(agentType: string | undefined): string {
  if (!agentType) return "Agent"
  return isAgentType(agentType) ? AGENT_NAMES[agentType] : agentType
}

function ApprovalCard({
  approval,
  onResolve,
}: {
  approval: PendingApproval
  onResolve: (a: PendingApproval, d: "approve" | "deny") => Promise<void>
}) {
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const finding = readVerifierFinding(approval)
  const flagged = finding?.verdict === "flag"
  const decide = async (d: "approve" | "deny") => {
    setBusy(d)
    setError(null)
    try {
      await onResolve(approval, d)
      notifyApprovalsChanged()
    } catch {
      setError("Couldn't record that, try again")
      setBusy(null)
    }
  }
  return (
    <div className="rounded-xl border border-amber/25 bg-amber/[0.05] p-3.5 text-left">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white/85" title={approval.tool_name}>
          {describeTool(approval.tool_name)}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
            flagged ? "bg-red-400/15 text-red-200" : "bg-amber/15 text-amber"
          }`}
          title={flagged ? finding?.reasoning : undefined}
        >
          {flagged ? "Flagged" : "Needs approval"}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-white/40">
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 font-medium text-white/60">
          {agentLabel(approval._agent_type)}
        </span>
        <span className="tabular-nums">{relativeTime(new Date(approval.requested_at).getTime())}</span>
      </div>
      {approval.origin_message && (
        <div className="mt-1.5 truncate text-[11.5px] font-light text-white/50" title={approval.origin_message}>
          Asked: {approval.origin_message}
        </div>
      )}
      <div className="mt-2.5 flex items-center gap-1.5">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => decide("approve")}
          className={`rounded-full bg-white/[0.9] px-3 py-1 text-[11px] font-semibold text-black hover:bg-white ${PRESSABLE}`}
        >
          {busy === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => decide("deny")}
          className={`rounded-full border border-white/10 px-3 py-1 text-[11px] text-white/65 hover:bg-white/[0.06] hover:text-white/85 ${PRESSABLE}`}
        >
          {busy === "deny" ? "Denying…" : "Deny"}
        </button>
        {error && <span className="text-[10.5px] text-red-300/80">{error}</span>}
      </div>
    </div>
  )
}

function TaskCard({
  task,
  orch,
  onChanged,
}: {
  task: EnrichedTask
  orch: Orchestration | undefined
  onChanged: () => void
}) {
  return (
    <div
      className={`rounded-xl border p-3.5 text-left ${
        task.is_parent
          ? "border-white/[0.14] bg-white/[0.055]"
          : "border-white/[0.06] bg-white/[0.03]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white/85" title={task.title}>
          {task.title || "Untitled task"}
        </span>
        {task.overdue && (
          <span className="shrink-0 rounded-full bg-amber/15 px-2 py-0.5 text-[10.5px] font-semibold text-amber">
            Overdue
          </span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-white/40">
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 font-medium text-white/60">
          {task.agent_type}
        </span>
        {task.is_parent && (
          <span className="rounded-full border border-white/10 bg-white/[0.07] px-2 py-0.5 font-semibold text-white/75">
            Orchestration
          </span>
        )}
        <span className="tabular-nums">
          {task.status === "done"
            ? `took ${formatElapsed(task.elapsed_ms)}`
            : `${formatElapsed(task.elapsed_ms)} elapsed`}
        </span>
      </div>
      {task.is_parent && orch && (
        <div className="mt-1.5 text-[11px] font-light text-white/45">
          {orch.children.length} step{orch.children.length === 1 ? "" : "s"} · {orch.open_count} open
          {orch.overdue_count > 0 ? ` · ${orch.overdue_count} overdue` : ""}
        </div>
      )}
      {task.status === "done" && task.result_summary && (
        <div className="mt-1.5 truncate text-[11.5px] font-light text-white/50" title={task.result_summary}>
          Result: {task.result_summary}
        </div>
      )}
      {task.status === "blocked" && task.blocked_reason && (
        <div className="mt-1.5 truncate text-[11.5px] font-light text-amber/90" title={task.blocked_reason}>
          Waiting: {task.blocked_reason}
        </div>
      )}
      <div className="mt-1.5 flex items-center justify-between text-[10.5px] font-light text-white/25">
        <span className="truncate">{shortSession(task.session_id)}</span>
        <span className="shrink-0 tabular-nums">{relativeTime(new Date(task.updated_at).getTime())}</span>
      </div>
      {OPEN_STATUSES.has(task.status) && (
        <div className="mt-2 flex justify-end">
          <StopControl taskId={task.task_id} onStopped={onChanged} />
        </div>
      )}
    </div>
  )
}

async function fetchTaskLedger(): Promise<TasksResponse> {
  // Refresh-aware: backend access tokens expire after 60 minutes.
  // A plain fetch with a stale Bearer would 401 here with no recovery
  // (the "Mission ledger unavailable (HTTP 401)" wall). authedFetch retries
  // once after exchanging the stored refresh_token, and fires the
  // session-expired modal when the refresh itself is dead — same choke point
  // every other authenticated dashboard module goes through.
  const r = await authedFetch("/api/aira/tasks?limit=100")
  if (!r.ok) {
    if (r.status === 401) throw new Error("HTTP 401 — session expired, please sign in again")
    throw new Error(`HTTP ${r.status}`)
  }
  return (await r.json()) as TasksResponse
}

export default function MissionTimeline({ variant = "full" }: { variant?: "compact" | "full" }) {
  const [data, setData] = useState<TasksResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      setData(await fetchTaskLedger())
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  // Same shape as MissionControl's workspace fetch: the async work lives in
  // an inner function so the effect body itself only subscribes/polls.
  useEffect(() => {
    let alive = true
    const init = async () => {
      try {
        const j = await fetchTaskLedger()
        if (alive) setData(j)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "failed to load")
      } finally {
        if (alive) setLoading(false)
      }
    }
    init()
    // Ledger moves on human/approval cadence, not per-second — 10s keeps the
    // board fresh without hammering the DB behind /api/aira/tasks.
    const t = setInterval(async () => {
      if (!alive) return
      try {
        const j = await fetchTaskLedger()
        if (alive) setData(j)
      } catch {}
    }, 10_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const { byAgent, resolve } = useAgentApprovals()
  const approvals = Object.values(byAgent)
    .flat()
    .sort((a, b) => b.requested_at.localeCompare(a.requested_at))

  const orchBySession = new Map<string, Orchestration>(
    (data?.orchestrations ?? []).map((o) => [o.session_id, o]),
  )
  const perColumn = variant === "compact" ? 3 : Number.POSITIVE_INFINITY

  return (
    <section aria-label="Mission Timeline">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[12px] font-medium uppercase tracking-wider text-white/40">
          Mission Timeline
        </span>
        {data && (
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/40">
            {data.counts.total} task{data.counts.total === 1 ? "" : "s"}
          </span>
        )}
        {approvals.length > 0 && (
          <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[11px] text-amber">
            {approvals.length} approval{approvals.length === 1 ? "" : "s"}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {data && (
            <span className="hidden text-[10.5px] font-light text-white/25 sm:inline">
              SLA {data.sla.child_minutes}m steps · {data.sla.parent_minutes}m orchestration
            </span>
          )}
          {variant === "compact" && (
            <Link
              href="/console/missions"
              className="text-[11px] text-white/50 underline decoration-white/20 underline-offset-2 hover:text-white/80"
            >
              Open board
            </Link>
          )}
          <button
            onClick={load}
            className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/60 hover:bg-white/[0.08]"
          >
            Refresh
          </button>
        </span>
      </div>

      {loading && !data ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 text-[12.5px] font-light text-white/40">
          Loading missions…
        </div>
      ) : error && !data ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 text-[12.5px] font-light text-white/50">
          Mission ledger unavailable ({error}).{" "}
          <button onClick={load} className="underline decoration-white/20 underline-offset-2 hover:text-white/80">
            Retry
          </button>
        </div>
      ) : !data || (data.counts.total === 0 && approvals.length === 0) ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 text-[12.5px] font-light text-white/40">
          No missions yet — ask Aira in the Room to start one and it will appear here.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            // Waiting = blocked tasks + pending approvals (approvals first:
            // they are the ones a person can act on right now).
            const colApprovals = col.key === "blocked" ? approvals : []
            const shownApprovals = colApprovals.slice(0, perColumn)
            const cards = (data.columns[col.key] ?? []).slice(0, Math.max(0, perColumn - shownApprovals.length))
            const total = (data.columns[col.key]?.length ?? 0) + colApprovals.length
            const shown = cards.length + shownApprovals.length
            return (
              <div key={col.key} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-[12px] font-medium text-white/70" title={col.hint}>
                    {col.title}
                  </span>
                  <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] tabular-nums text-white/50">
                    {total}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {shown === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/[0.08] px-3 py-4 text-center text-[11.5px] font-light text-white/25">
                      Empty
                    </div>
                  ) : (
                    <>
                      {shownApprovals.map((a) => (
                        <ApprovalCard key={`approval-${a.id}`} approval={a} onResolve={resolve} />
                      ))}
                      {cards.map((t) => (
                        <TaskCard
                          key={t.task_id}
                          task={t}
                          orch={t.session_id ? orchBySession.get(t.session_id) : undefined}
                          onChanged={load}
                        />
                      ))}
                    </>
                  )}
                  {variant === "compact" && total > shown && (
                    <Link
                      href="/console/missions"
                      className="rounded-xl border border-white/[0.06] px-3 py-2 text-center text-[11px] text-white/45 hover:bg-white/[0.04] hover:text-white/70"
                    >
                      +{total - shown} more in {col.title}
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="mt-2 text-[11px] font-light text-white/25">
        Cards can&apos;t be dragged: status moves through approvals. Resolve them under Waiting, or stop a stuck task.
      </div>
    </section>
  )
}
