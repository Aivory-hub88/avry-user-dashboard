"use client"
/**
 * Mission Timeline — Phase 3C kanban over the Phase 3B task ledger.
 *
 * Read-only by contract (services/cerveau/TASK-CONTRACT.md): status moves
 * happen via approvals in Console/Room, never by dragging cards here. This
 * component only renders what GET /api/aira/tasks already groups into
 * `columns` + `orchestrations` — no reshaping, no mutations.
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

function TaskCard({ task, orch }: { task: EnrichedTask; orch: Orchestration | undefined }) {
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
        <span className="tabular-nums">{formatElapsed(task.elapsed_ms)} elapsed</span>
      </div>
      {task.is_parent && orch && (
        <div className="mt-1.5 text-[11px] font-light text-white/45">
          {orch.children.length} step{orch.children.length === 1 ? "" : "s"} · {orch.open_count} open
          {orch.overdue_count > 0 ? ` · ${orch.overdue_count} overdue` : ""}
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
      ) : !data || data.counts.total === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 text-[12.5px] font-light text-white/40">
          No missions yet — ask Aira in the Room to start one and it will appear here.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const cards = (data.columns[col.key] ?? []).slice(0, perColumn)
            const total = data.columns[col.key]?.length ?? 0
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
                  {cards.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/[0.08] px-3 py-4 text-center text-[11.5px] font-light text-white/25">
                      Empty
                    </div>
                  ) : (
                    cards.map((t) => (
                      <TaskCard key={t.task_id} task={t} orch={t.session_id ? orchBySession.get(t.session_id) : undefined} />
                    ))
                  )}
                  {variant === "compact" && total > cards.length && (
                    <Link
                      href="/console/missions"
                      className="rounded-xl border border-white/[0.06] px-3 py-2 text-center text-[11px] text-white/45 hover:bg-white/[0.04] hover:text-white/70"
                    >
                      +{total - cards.length} more in {col.title}
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="mt-2 text-[11px] font-light text-white/25">
        Read-only — status moves via approvals in Console, not by dragging cards here.
      </div>
    </section>
  )
}
