"use client"

/** One activity row, shared by the record panel (deletable) and the feed (shows its subject). */
import { useState } from "react"
import type { Activity } from "@/lib/crmClient"
import { agentLabel, DUE_TONE, dueState, formatWhen, KIND_META, SUBJECT_LABEL } from "@/lib/crmActivity"

export default function ActivityItem({
  a,
  subjectName,
  onOpenSubject,
  onDelete,
}: {
  a: Activity
  subjectName?: string
  onOpenSubject?: () => void
  onDelete?: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const meta = KIND_META[a.kind]
  const due = dueState(a.due_at)
  const actor = a.owner_agent ? agentLabel(a.owner_agent) : "You"

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/40">
        <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
        <span className="font-medium text-white/70">{meta.label}</span>
        <span>{actor}</span>
        <span>{formatWhen(a.occurred_at)}</span>
        {a.due_at && due !== "none" && (
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${DUE_TONE[due]}`}>
            {due === "overdue" ? "Overdue" : "Due"} {formatWhen(a.due_at)}
          </span>
        )}
      </div>
      {subjectName && (
        <button onClick={onOpenSubject} className="mt-1 max-w-full truncate text-left text-[12px] text-white/55 underline decoration-white/15 underline-offset-2 hover:text-white/85">
          {SUBJECT_LABEL[a.subject_type]}: {subjectName}
        </button>
      )}
      {a.body && <div className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-white/80">{a.body}</div>}
      {onDelete && (
        <div className="mt-1.5 text-[11px]">
          {confirming ? (
            <span className="text-white/45">
              Delete this entry?{" "}
              <button onClick={onDelete} className="text-red-300/90 hover:text-red-200">
                Delete
              </button>
              {" · "}
              <button onClick={() => setConfirming(false)} className="text-white/55 hover:text-white/80">
                Keep
              </button>
            </span>
          ) : (
            <button onClick={() => setConfirming(true)} className="text-white/25 hover:text-red-300/90">
              Delete
            </button>
          )}
        </div>
      )}
    </li>
  )
}
