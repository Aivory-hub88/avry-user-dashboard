"use client"
/**
 * What an agent is about to do, shown on its approval card: the tool call's
 * arguments (recipient, subject, body…) and the verifier's advisory finding.
 * Without this the person approving only sees "Gmail — send email".
 *
 * The room's task row carries just {id, tool_name, risk_tier}; the arguments
 * live on the pending approval, so we look it up by id. Any failure renders
 * nothing — the card still works, the decision is just less informed.
 */
import { useEffect, useState } from "react"
import { listPendingApprovals, readVerifierFinding, type PendingApproval } from "@/lib/agentApprovals"

const SECRET_KEY = /token|secret|password|passwd|api[-_]?key|authorization|credential/i
const MAX_VALUE_CHARS = 600
const MAX_FIELDS = 12

export interface ArgumentRow {
  key: string
  value: string
}

/** Human-readable label: "to_email" → "To email". */
function labelOf(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim()
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key
}

function valueOf(key: string, v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null
  if (SECRET_KEY.test(key)) return "••••••"
  const text = typeof v === "string" ? v : JSON.stringify(v)
  if (!text || text === "[]" || text === "{}") return null
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text
}

/** Flatten a tool call's arguments into display rows. Exported for tests. */
export function argumentRows(args: Record<string, unknown> | null | undefined): ArgumentRow[] {
  if (!args || typeof args !== "object") return []
  const rows: ArgumentRow[] = []
  for (const [key, raw] of Object.entries(args)) {
    const value = valueOf(key, raw)
    if (value !== null) rows.push({ key: labelOf(key), value })
    if (rows.length >= MAX_FIELDS) break
  }
  return rows
}

export default function ApprovalArguments({ approvalId }: { approvalId: string }) {
  const [approval, setApproval] = useState<PendingApproval | null>(null)

  useEffect(() => {
    let alive = true
    listPendingApprovals()
      .then((all) => {
        if (alive) setApproval(all.find((a) => a.id === approvalId) ?? null)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [approvalId])

  if (!approval) return null
  const rows = argumentRows(approval.arguments)
  const finding = readVerifierFinding(approval)
  if (rows.length === 0 && !finding) return null

  return (
    <div className="mt-2 space-y-2 text-[12px]">
      {rows.length > 0 && (
        <dl className="space-y-1.5 rounded-lg bg-white/[0.04] p-2.5">
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-[88px_1fr] gap-2">
              <dt className="text-white/45">{r.key}</dt>
              <dd className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-white/85">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {finding && (
        <div className={finding.verdict === "flag" ? "text-amber-300/90" : "text-white/50"}>
          {finding.verdict === "error"
            ? "Automated check didn't complete — use your own judgement."
            : `Automated check: ${finding.reasoning}`}
        </div>
      )}
    </div>
  )
}
