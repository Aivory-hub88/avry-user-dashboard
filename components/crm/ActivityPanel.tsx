"use client"

/** Side panel: the activity history of one company, contact or deal, and a form to log a new entry. */
import { useCallback, useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { Button, fieldClass } from "@/components/requests/requestUi"
import ActivityItem from "@/components/crm/ActivityItem"
import { crmApi, type Activity } from "@/lib/crmClient"
import { ACTIVITY_KINDS, KIND_META, localInputToIso, MAX_ACTIVITY_BODY, SUBJECT_LABEL, type ActivityKind, type SubjectType } from "@/lib/crmActivity"

export type Subject = { type: SubjectType; id: string; name: string }

export default function ActivityPanel({ subject, onClose, onChanged }: { subject: Subject; onClose: () => void; onChanged: () => void }) {
  const [rows, setRows] = useState<Activity[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<ActivityKind>("note")
  const [body, setBody] = useState("")
  const [due, setDue] = useState("")
  const [busy, setBusy] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async () => {
    try {
      setRows(await crmApi.activities.list({ subject_type: subject.type, subject_id: subject.id }))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [subject.type, subject.id])

  useEffect(() => {
    // Fetch when the subject changes; load() only sets state after its await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    bodyRef.current?.focus()
  }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const add = async () => {
    const text = body.trim()
    if (busy || !text) return
    setBusy(true)
    setError(null)
    try {
      await crmApi.activities.create({ kind, subject_type: subject.type, subject_id: subject.id, body: text, due_at: localInputToIso(due) })
      setBody("")
      setDue("")
      await load()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  const toggleDone = async (a: Activity) => {
    setError(null)
    try {
      await crmApi.activities.complete(a.id, !a.completed_at)
      await load()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const remove = async (id: string) => {
    setError(null)
    try {
      await crmApi.activities.remove(id)
      await load()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <aside role="dialog" aria-modal="true" aria-label={`Activity for ${subject.name}`} className="absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col border-l border-line bg-surface-1 shadow-2xl">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wide text-white/35">{SUBJECT_LABEL[subject.type]}</div>
            <div className="mt-0.5 break-words text-[15px] font-medium text-white/90">{subject.name}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="mt-0.5 text-white/40 hover:text-white/80">
            <X size={16} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
          className="space-y-2 border-b border-line px-5 py-4"
        >
          <div className="flex gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as ActivityKind)} aria-label="Type" className={`w-[120px] ${fieldClass}`}>
              {ACTIVITY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_META[k].label}
                </option>
              ))}
            </select>
            <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Follow-up (optional)" className={`min-w-0 flex-1 ${fieldClass}`} />
          </div>
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void add()
              }
            }}
            maxLength={MAX_ACTIVITY_BODY}
            rows={3}
            placeholder="What happened, or what needs to happen?"
            aria-label="Details"
            className={`w-full resize-none ${fieldClass}`}
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-white/30">Set a follow-up time to see it under Activity.</span>
            <Button tone="primary" type="submit" disabled={busy || body.trim() === ""}>
              Log
            </Button>
          </div>
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && <div className="m-4 rounded-xl bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">{error}</div>}
          {rows === null ? (
            <div className="m-4 h-24 animate-pulse rounded-2xl bg-white/[0.03]" />
          ) : rows.length === 0 ? (
            <div className="m-4 rounded-2xl border border-dashed border-line px-5 py-8 text-center text-[12px] text-white/35">Nothing logged yet.</div>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((a) => (
                <ActivityItem key={a.id} a={a} onDelete={() => remove(a.id)} onToggleDone={() => toggleDone(a)} />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  )
}
