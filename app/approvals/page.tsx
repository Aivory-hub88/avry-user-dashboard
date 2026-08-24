"use client"

import { useCallback, useEffect, useState } from "react"
import {
  listPendingApprovals,
  resolveApproval,
  type PendingApproval,
} from "@/lib/agentApprovals"

/** "composio-erpnext-erp__ERPNEXT_MAKE_SALES_INVOICE" -> "ERPNext — Make Sales Invoice" */
function describeTool(toolName: string): string {
  const [server, action] = toolName.includes("__") ? toolName.split("__") : [null, toolName]
  const toolkit = server
    ?.replace(/^composio-/, "")
    .replace(/-[a-z]+$/, "")
    .replace(/^\w/, (c) => c.toUpperCase()) ?? null
  const readable = action
    .replace(/^[A-Z]+_/, "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
  return toolkit ? `${toolkit} — ${readable}` : readable
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const diffMs = Date.now() - then
  const mins = Math.round(diffMs / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function ArgumentsSummary({ args }: { args: Record<string, unknown> }) {
  const entries = Object.entries(args ?? {})
  if (entries.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-white/40">
      {entries.slice(0, 5).map(([key, value]) => (
        <span key={key}>
          <span className="text-white/30">{key}:</span>{" "}
          {typeof value === "object" ? JSON.stringify(value) : String(value)}
        </span>
      ))}
    </div>
  )
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<PendingApproval[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null)

  const refetch = useCallback(() => {
    setError(null)
    listPendingApprovals()
      .then(setApprovals)
      .catch(() => setError("Could not load pending approvals."))
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const handleDecision = async (approval: PendingApproval, decision: "approve" | "deny") => {
    setBusyId(approval.id)
    setFeedback(null)
    try {
      const result = await resolveApproval(approval, decision)
      setApprovals((prev) => (prev ?? []).filter((a) => a.id !== approval.id))
      setFeedback({
        type: "success",
        message:
          decision === "approve"
            ? "Approved — the agent is carrying it out now."
            : "Denied.",
      })
      if (result.reply) {
        // Nothing further to show inline — the agent's own reply lands back
        // in the conversation that originated this approval, not here.
      }
    } catch {
      setFeedback({ type: "error", message: `Could not ${decision} — try again.` })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-xl font-medium text-white">Approvals</h1>
      <p className="mt-1.5 text-[13px] text-white/50">
        Writes to your systems always ask for your approval first. Anything your agents are
        waiting on shows up here.
      </p>

      {feedback && (
        <div
          className={`mt-4 rounded-lg px-3 py-2 text-[13px] ${
            feedback.type === "success"
              ? "bg-[#b7cba6]/10 border border-[#b7cba6]/25 text-[#dbe5d3]"
              : "bg-red-500/10 border border-red-500/25 text-red-300"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="mt-6 space-y-2">
        {approvals === null && !error && (
          <div className="py-10 text-center text-white/40 text-[13px]">Loading…</div>
        )}

        {error && (
          <div className="py-10 text-center text-white/40 text-[13px]">
            {error}{" "}
            <button onClick={refetch} className="underline hover:text-white/60">
              Retry
            </button>
          </div>
        )}

        {approvals !== null && approvals.length === 0 && !error && (
          <div className="py-10 text-center text-white/40 text-[13px]">
            Nothing waiting on you right now.
          </div>
        )}

        {approvals?.map((approval) => {
          const busy = busyId === approval.id
          return (
            <div
              key={approval.id}
              className="px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white/80 text-[13px] font-medium">
                      {describeTool(approval.tool_name)}
                    </span>
                    <span className="text-white/30 text-[11px]">
                      {relativeTime(approval.requested_at)}
                    </span>
                  </div>
                  <ArgumentsSummary args={approval.arguments} />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleDecision(approval, "deny")}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-white/10 text-white/60 hover:text-white/90 hover:border-white/20 disabled:opacity-40 transition-colors"
                  >
                    Deny
                  </button>
                  <button
                    onClick={() => handleDecision(approval, "approve")}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#b7cba6]/15 border border-[#b7cba6]/25 text-[#dbe5d3] hover:bg-[#b7cba6]/25 disabled:opacity-40 transition-colors"
                  >
                    Approve
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
