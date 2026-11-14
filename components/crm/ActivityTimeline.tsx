"use client"

/**
 * A record's timeline: a composer to log a note, call, email, meeting or task,
 * then everything logged against the record — by you or an agent — newest
 * first, filterable by who did it and by open follow-ups.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { Button, fieldClass } from "@/components/requests/requestUi"
import ActivityItem from "@/components/crm/ActivityItem"
import { crmApi, type Activity } from "@/lib/crmClient"
import { ACTIVITY_KINDS, isCompletable, KIND_META, localInputToIso, MAX_ACTIVITY_BODY, type ActivityKind, type SubjectType } from "@/lib/crmActivity"

type Filter = "all" | "you" | "agents" | "open"

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "you", label: "From you" },
  { key: "agents", label: "From agents" },
  { key: "open", label: "Open follow-ups" },
]

export default function ActivityTimeline({
  subjectType,
  subjectId,
  subjectName,
  onCount,
}: {
  subjectType: SubjectType
  subjectId: string
  subjectName: string
  onCount?: (n: number) => void
}) {
  const [rows, setRows] = useState<Activity[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<ActivityKind>("note")
  const [body, setBody] = useState("")
  const [due, setDue] = useState("")
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<Filter>("all")

  const load = useCallback(async () => {
    try {
      const r = await crmApi.activities.list({ subject_type: subjectType, subject_id: subjectId })
      setRows(r)
      onCount?.(r.length)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [subjectType, subjectId, onCount])

  useEffect(() => {
    // Fetch when the subject changes; load() only sets state after its await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const act = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const add = async () => {
    const text = body.trim()
    if (busy || !text) return
    setBusy(true)
    await act(async () => {
      await crmApi.activities.create({ kind, subject_type: subjectType, subject_id: subjectId, body: text, due_at: localInputToIso(due) })
      setBody("")
      setDue("")
    })
    setBusy(false)
  }

  const shown = useMemo(() => {
    const r = rows ?? []
    if (filter === "you") return r.filter((a) => !a.owner_agent)
    if (filter === "agents") return r.filter((a) => !!a.owner_agent)
    if (filter === "open") return r.filter((a) => isCompletable(a) && !a.completed_at)
    return r
  }, [rows, filter])

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
        className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5"
      >
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Type">
          {ACTIVITY_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={`rounded-full px-3 py-1 text-[12px] transition-colors ${kind === k ? "bg-white text-black" : "text-white/55 hover:text-white/85"}`}
            >
              {KIND_META[k].label}
            </button>
          ))}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void add()
            }
          }}
          maxLength={MAX_ACTIVITY_BODY}
          rows={2}
          placeholder={kind === "task" ? "What needs to happen?" : "What happened?"}
          aria-label="Details"
          className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-white/90 outline-none placeholder:text-white/30"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-[11px] text-white/50">
            Follow up
            <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Follow-up (optional)" className={`${fieldClass} py-1 text-[12px]`} />
          </label>
          <span className="flex items-center gap-2">
            <span className="hidden text-[11px] text-white/35 sm:inline">Linked to {subjectName}</span>
            <Button tone="primary" type="submit" disabled={busy || body.trim() === ""}>
              Log
            </Button>
          </span>
        </div>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-[12px] transition-colors ${
              filter === f.key ? "bg-white/[0.1] text-white" : "border border-line text-white/55 hover:text-white/85"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">{error}</div>}
      {rows === null ? (
        !error && <div className="h-24 animate-pulse rounded-2xl bg-white/[0.03]" />
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-[12px] text-white/40">
          {rows.length === 0 ? "Nothing logged yet. Calls, emails and notes from you and your agents show up here." : "Nothing matches this filter."}
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {shown.map((a) => (
            <ActivityItem key={a.id} a={a} onDelete={() => act(() => crmApi.activities.remove(a.id))} onToggleDone={() => act(() => crmApi.activities.complete(a.id, !a.completed_at))} />
          ))}
        </ul>
      )}
    </div>
  )
}
