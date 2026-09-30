"use client"

/** One activity row, shared by the record panel (deletable) and the feed (shows its subject). */
import { useState } from "react"
import { Check } from "lucide-react"
import type { Activity } from "@/lib/crmClient"
import { activityState, agentLabel, DUE_TONE, formatWhen, isCompletable, KIND_META, SUBJECT_LABEL } from "@/lib/crmActivity"

export default function ActivityItem({
  a,
  subjectName,
  onOpenSubject,
  onDelete,
  onToggleDone,
}: {
  a: Activity
  subjectName?: string
  onOpenSubject?: () => void
  onDelete?: () => void
  /** Ticks a follow-up or task off (or reopens it). Only shown for completable entries. */
  onToggleDone?: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const meta = KIND_META[a.kind]
  const state = activityState(a)
  const done = state === "done"
  const actor = a.owner_agent ? agentLabel(a.owner_agent) : "You"
  const canTick = !!onToggleDone && isCompletable(a)

  return (
    <li className="flex gap-3 px-4 py-3">
      {canTick && (
        <button
          role="checkbox"
          aria-checked={done}
          aria-label={done ? "Mark as not done" : "Mark as done"}
          onClick={onToggleDone}
          className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors ${
            done ? "border-emerald-400/70 bg-emerald-400/20 text-emerald-300" : "border-white/25 text-transparent hover:border-white/55 hover:text-white/35"
          }`}
        >
          <Check size={11} strokeWidth={3} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/40">
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
          <span className="font-medium text-white/70">{meta.label}</span>
          <span>{actor}</span>
          <span>{formatWhen(a.occurred_at)}</span>
          {done && a.completed_at ? (
            <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${DUE_TONE.done}`}>Done {formatWhen(a.completed_at)}</span>
          ) : (
            a.due_at &&
            state !== "none" && (
              <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${DUE_TONE[state as Exclude<typeof state, "none" | "done">]}`}>
                {state === "overdue" ? "Overdue" : "Due"} {formatWhen(a.due_at)}
              </span>
            )
          )}
        </div>
        {subjectName && (
          <button onClick={onOpenSubject} className="mt-1 max-w-full truncate text-left text-[12px] text-white/55 underline decoration-white/15 underline-offset-2 hover:text-white/85">
            {SUBJECT_LABEL[a.subject_type]}: {subjectName}
          </button>
        )}
        {a.body && (
          <div className={`mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed ${done ? "text-white/40 line-through decoration-white/25" : "text-white/80"}`}>{a.body}</div>
        )}
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
      </div>
    </li>
  )
}
