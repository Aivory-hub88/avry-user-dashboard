/**
 * SpaceAgentPanel — kartu task + approval di panel thread (Phase 3, F4).
 *
 * - Task card: status Running (white/60) → Idle (white/35) ala MissionControl,
 *   badge count bg-amber/15 untuk yang terbuka.
 * - Mention → task `todo` baru → otomatis di-run sekali (client-triggered,
 *   teruskan JWT user ke backend agent-chat). Tombol Jalankan untuk
 *   mengulang yang failed.
 * - Blocked + approval_ref → kartu approval bahasa NotificationCard
 *   (netral, glyph ⚠ #FF9F0A, Approve sage #b7cba6, Deny sekunder).
 *   Approve → resolve + lanjutkan turn; Deny → resolve + cancel (nol tulis).
 * - Receipt 👀/✅/❗ di pesan pemicu = derived dari status task (bukan chat baru).
 * - Poll 5 detik ala MissionControl selama panel terbuka.
 */
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { collabAuthHeaders } from "@/lib/collabClient"
import { agentDisplayName, type SpaceAgentTask } from "@/lib/spaceAgent"
import { POLL_MS, APPROVE_CLASS } from "@/lib/spaceUi"
import { NotificationCard } from "@/components/office/NotificationCard"
import {
  listPendingApprovals,
  resolveApproval,
  readVerifierFinding,
  type PendingApproval,
} from "@/lib/agentApprovals"

const OPEN = new Set(["todo", "in_progress", "blocked"])

function approvalOf(task: SpaceAgentTask): { id: string; tool: string; risk: string } | null {
  const ref = task.approvalRef as Record<string, unknown>
  if (typeof ref.id !== "string" || !ref.id) return null
  return {
    id: ref.id,
    tool: typeof ref.tool_name === "string" ? ref.tool_name : "tool",
    risk: typeof ref.risk_tier === "string" ? ref.risk_tier : "",
  }
}

export default function SpaceAgentPanel({
  spaceId,
  threadRoot,
  canWrite,
  onChanged,
}: {
  spaceId: string
  threadRoot: string
  canWrite: boolean
  onChanged: () => void
}) {
  const [tasks, setTasks] = useState<SpaceAgentTask[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [findings, setFindings] = useState<Record<string, PendingApproval>>({})
  const runningRef = useRef<Set<string>>(new Set())
  const prevStatusRef = useRef<Map<string, string>>(new Map())
  const requestRef = useRef(0)
  const loadRef = useRef<() => Promise<void>>(async () => {})

  const runTask = useCallback(
    async (taskId: string, after: { id: string; decision: "approve" | "deny" } | null) => {
      if (!canWrite) return
      setBusy(taskId)
      try {
        const r = await fetch(`/api/workspace/${spaceId}/agent-tasks/${taskId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
          body: JSON.stringify(
            after ? { afterApprovalId: after.id, decision: after.decision } : {},
          ),
        })
        if (r.ok || r.status === 502) {
          onChanged()
          await loadRef.current()
        }
      } catch {
        // diam
      }
      setBusy(null)
    },
    [spaceId, canWrite, onChanged],
  )

  const load = useCallback(async () => {
    const my = ++requestRef.current
    try {
      const r = await fetch(
        `/api/workspace/${spaceId}/agent-tasks?thread=${encodeURIComponent(threadRoot)}`,
        { headers: collabAuthHeaders(), cache: "no-store" },
      )
      if (!r.ok || my !== requestRef.current) return
      const j = await r.json()
      if (my !== requestRef.current) return
      const list: SpaceAgentTask[] = Array.isArray(j.tasks) ? j.tasks : []
      // Thread refresh saat status flip (balasan agent server-triggered).
      const prev = prevStatusRef.current
      const flipped = list.some(
        (t) =>
          prev.has(t.id) &&
          prev.get(t.id) !== t.status &&
          (t.status === "done" || t.status === "failed" || t.status === "blocked" || t.status === "cancelled"),
      )
      prevStatusRef.current = new Map(list.map((t) => [t.id, t.status]))
      if (my !== requestRef.current) return
      setTasks(list)
      if (flipped) onChanged()
      // Cari full approval row (verifier finding) untuk yang blocked.
      const blocked = list.filter((t) => t.status === "blocked" && approvalOf(t))
      if (blocked.length > 0) {
        listPendingApprovals()
          .then((all) => {
            if (my !== requestRef.current) return
            const map: Record<string, PendingApproval> = {}
            for (const a of all) map[a.id] = a
            setFindings((prev) => ({ ...map, ...prev }))
          })
          .catch(() => {})
      }
      // Auto-run backup: semua todo jalan (server primer fire-and-forget;
      // di sini idempoten — 409 bila sudah diambil). Guard in-flight lokal.
      if (canWrite) {
        for (const t of list) {
          if (t.status === "todo" && !runningRef.current.has(t.id)) {
            runningRef.current.add(t.id)
            void runTask(t.id, null).finally(() => {
              runningRef.current.delete(t.id)
            })
          }
        }
      }
    } catch {
      // diam — poll berikutnya mencoba lagi
    }
  }, [spaceId, threadRoot, canWrite, onChanged, runTask])

  useEffect(() => {
    loadRef.current = load
    void load()
    const timer = setInterval(() => void load(), POLL_MS.agentPanel)
    return () => {
      requestRef.current += 1
      clearInterval(timer)
    }
  }, [load])

  const decide = useCallback(
    async (task: SpaceAgentTask, approvalId: string, decision: "approve" | "deny") => {
      if (!canWrite) return
      setBusy(task.id)
      try {
        await resolveApproval({ id: approvalId }, decision)
        if (decision === "approve") {
          await runTask(task.id, { id: approvalId, decision })
        } else {
          await fetch(`/api/workspace/${spaceId}/agent-tasks/${task.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
            body: JSON.stringify({ op: "cancel" }),
          })
          void load()
        }
      } catch {
        // diam — approval mungkin sudah di-resolve di tempat lain
      }
      setBusy(null)
      void load()
    },
    [spaceId, canWrite, runTask, load],
  )

  if (tasks.length === 0) return null

  const openCount = tasks.filter((t) => OPEN.has(t.status)).length
  const names = [...new Set(tasks.map((t) => agentDisplayName(t.agentType)))]
  const allDone = tasks.every((t) => t.status === "done")
  const failed = tasks.some((t) => t.status === "failed")

  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/35">Agent</span>
        {openCount > 0 && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
            {openCount} running
          </span>
        )}
      </div>
      <div className="text-[12px] text-white/45">
        {openCount > 0 ? (
          <span>
            <span className="mr-1">👀</span>
            {names.join(", ")} working…
          </span>
        ) : allDone ? (
          <span>
            <span className="mr-1">✅</span>
            {names.join(", ")} done
          </span>
        ) : failed ? (
          <span>
            <span className="mr-1">❗</span>
            Something failed — retry
          </span>
        ) : null}
      </div>
      {tasks.map((t) => {
        const running = t.status === "todo" || t.status === "in_progress"
        const ap = approvalOf(t)
        const full = ap ? findings[ap.id] : undefined
        const finding = full ? readVerifierFinding(full) : null
        return (
          <div key={t.id}>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-white/[0.03] px-3 py-2">
              <span className={`text-[12px] font-medium ${running ? "text-white/60" : "text-white/35"}`}>
                {agentDisplayName(t.agentType)}
              </span>
              <span className="text-[11px] text-white/30">
                {t.status === "in_progress" ? "Running…" : t.status === "todo" ? "Queued…" : t.status === "blocked" ? "Waiting for approval" : t.status === "done" ? "Idle" : t.status}
              </span>
              {t.reason && t.status !== "done" && (
                <span className="truncate text-[11px] text-white/25">{t.reason}</span>
              )}
              {canWrite && (t.status === "todo" || t.status === "failed") && (
                <button
                  onClick={() => void runTask(t.id, null)}
                  disabled={busy === t.id}
                  className="ml-auto shrink-0 rounded-full bg-white/[0.08] px-3 py-1 text-[11px] text-white/75 hover:bg-white/[0.12] disabled:opacity-40"
                >
                  {busy === t.id ? "…" : t.status === "failed" ? "Retry" : "Run"}
                </button>
              )}
            </div>
            {t.status === "blocked" && ap && (
              <div className="mt-2">
                <NotificationCard
                  tone="warn"
                  badge="Approval"
                  icon={<span className="text-[16px] leading-none">⚠</span>}
                  title={
                    <span className="text-[13.5px] font-semibold text-white/90">
                      {agentDisplayName(t.agentType)} needs approval
                    </span>
                  }
                  subtitle={
                    <span className="text-[12.5px] text-white/55">
                      {ap.tool}
                      {ap.risk ? ` · risk ${ap.risk}` : ""}
                      {finding ? ` — Automated check: ${finding.reasoning}` : ""}
                    </span>
                  }
                  meta={t.updatedAt}
                  actions={
                    canWrite ? (
                      <span className="flex gap-2">
                        <button
                          onClick={() => void decide(t, ap.id, "approve")}
                          disabled={busy === t.id}
                          className={APPROVE_CLASS}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => void decide(t, ap.id, "deny")}
                          disabled={busy === t.id}
                          className="rounded-full bg-white/[0.07] px-4 py-1.5 text-[12px] text-white/70 hover:bg-white/[0.12] disabled:opacity-50"
                        >
                          Deny
                        </button>
                      </span>
                    ) : undefined
                  }
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
