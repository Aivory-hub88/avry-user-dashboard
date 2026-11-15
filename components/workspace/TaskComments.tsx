"use client"

/**
 * Task drawer conversation: the comment composer with an `@` picker (room
 * people + invited agents), comment text with mention chips, and the
 * Activity list (this task's entries from the workspace activity log).
 *
 * The composer shows plain `@Name` while typing; on send, each name that was
 * picked from the menu becomes a typed token (`[@Name](#member:<id>)`, the
 * room chat's format), so notices go to that exact person.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { collabAuthHeaders } from "@/lib/collabClient"
import { personName } from "@/lib/roomChat"
import { AGENT_ROSTER } from "@/lib/agentRoster"
import { mentionSegments, personKey, tokenizeMentions, type PersonRef } from "@/lib/workspaceDbModel"
import { PersonAvatar, nameOf, type TaskAgent, type TaskPerson } from "@/components/workspace/TaskPeople"

type Candidate = { ref: PersonRef; label: string; sub?: string }

/** `@query` being typed right before the caret (null when not in a mention). */
function activeQuery(text: string, caret: number): { start: number; q: string } | null {
  const before = text.slice(0, caret)
  const m = /(^|\s)@([^\s@[\]]{0,30})$/.exec(before)
  if (!m) return null
  return { start: before.length - m[2].length - 1, q: m[2] }
}

export function CommentComposer({
  people,
  agents,
  onSend,
}: {
  people: TaskPerson[]
  agents: TaskAgent[]
  /** Called with the tokenized text and the people/agents it mentions. */
  onSend: (text: string, mentions: PersonRef[]) => void
}) {
  const [draft, setDraft] = useState("")
  const [picked, setPicked] = useState<Candidate[]>([])
  const [menu, setMenu] = useState<{ start: number; q: string } | null>(null)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const all: Candidate[] = useMemo(
    () => [
      ...people.map((p): Candidate => ({ ref: { kind: "user", id: p.id, name: p.name }, label: p.name })),
      ...agents.map((a): Candidate => ({ ref: { kind: "agent", type: a.type }, label: a.name, sub: "agent" })),
    ],
    [people, agents],
  )
  const hits = useMemo(() => {
    if (!menu) return []
    const q = menu.q.toLowerCase()
    return all.filter((c) => !q || c.label.toLowerCase().includes(q)).slice(0, 8)
  }, [all, menu])

  const sync = (text: string, caret: number) => {
    setMenu(activeQuery(text, caret))
    setActive(0)
  }

  const choose = (c: Candidate) => {
    if (!menu) return
    const label = c.label.replace(/[[\]\n]/g, "").trim() || "Member"
    const caretEnd = menu.start + 1 + menu.q.length
    const next = `${draft.slice(0, menu.start)}@${label} ${draft.slice(caretEnd)}`
    setDraft(next)
    setPicked((p) => [...p, { ...c, label }])
    setMenu(null)
    const caret = menu.start + label.length + 2
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(caret, caret)
    })
  }

  const send = () => {
    const text = draft.trim()
    if (!text) return
    const { text: tokenized, mentions } = tokenizeMentions(text, picked)
    onSend(tokenized.slice(0, 500), mentions)
    setDraft("")
    setPicked([])
    setMenu(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menu && hits.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActive((i) => (i + 1) % hits.length)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setActive((i) => (i - 1 + hits.length) % hits.length)
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        choose(hits[Math.min(active, hits.length - 1)])
        return
      }
    }
    if (menu && e.key === "Escape") {
      e.preventDefault()
      setMenu(null)
      return
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="relative mt-3 flex items-end gap-2">
      {menu && hits.length > 0 && (
        <div role="listbox" aria-label="Mention someone" className="absolute bottom-full left-0 z-30 mb-2 w-[260px] rounded-xl border border-line bg-[#1f1f1d] p-1.5 shadow-2xl">
          {hits.map((c, i) => (
            <button
              key={personKey(c.ref)}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(c)
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-white/75 ${i === active ? "bg-white/[0.07]" : ""}`}
            >
              <PersonAvatar person={c.ref} people={people} size={20} />
              <span className="min-w-0 flex-1 truncate">{c.label}</span>
              {c.sub && <span className="text-[10px] uppercase tracking-wider text-white/30">{c.sub}</span>}
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={inputRef}
        rows={1}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          sync(e.target.value, e.target.selectionStart ?? e.target.value.length)
        }}
        onKeyDown={onKeyDown}
        onClick={(e) => sync(draft, e.currentTarget.selectionStart ?? draft.length)}
        onBlur={() => setMenu(null)}
        placeholder="Write a comment… type @ to mention"
        className="max-h-32 min-h-[36px] flex-1 resize-none rounded-2xl border border-line bg-white/[0.04] px-3 py-2 text-[12px] text-white/80 placeholder:text-white/25 outline-none"
      />
      <button onClick={send} disabled={!draft.trim()} className="rounded-full bg-white px-4 py-2 text-[12px] font-medium text-black hover:bg-white/90 disabled:opacity-40">
        Send
      </button>
    </div>
  )
}

/** Live room name for a mentioned person (the stored label is a fallback for people who left). */
function chipLabel(ref: PersonRef, label: string, people: TaskPerson[]): string {
  return ref.kind === "user" ? nameOf({ ...ref, name: label }, people) : nameOf(ref, people)
}

/** Comment text with typed mentions rendered as chips. */
export function CommentText({ text, people }: { text: string; people: TaskPerson[] }) {
  const segs = mentionSegments(text)
  return (
    <>
      {segs.map((s, i) =>
        s.kind === "text" ? (
          <span key={i} className="whitespace-pre-wrap">{s.text}</span>
        ) : (
          <span
            key={i}
            className="mx-0.5 inline-flex items-center gap-1 rounded-full bg-violet-500/15 py-px pl-0.5 pr-1.5 align-middle text-[11.5px] text-violet-200"
            title={s.ref.kind === "agent" ? "Agent" : undefined}
          >
            <PersonAvatar person={s.ref.kind === "user" ? { ...s.ref, name: s.label } : s.ref} people={people} size={14} />
            {chipLabel(s.ref, s.label, people)}
          </span>
        ),
      )}
    </>
  )
}

export type ActivityItem = {
  id: string | number
  actor_type: string
  actor_id: string | null
  actor_name: string | null
  action: string
  summary: string
  metadata?: Record<string, unknown> | null
  created_at: string
}

function actorName(a: ActivityItem, people: TaskPerson[]): string {
  if (a.actor_type === "agent") return AGENT_ROSTER.find((r) => r.type === a.actor_id)?.name ?? "An agent"
  const known = people.find((p) => p.id === a.actor_id)?.name
  return personName(a.actor_name ?? "", known)
}

function keyName(key: unknown, people: TaskPerson[]): string {
  if (typeof key !== "string" || !key) return "nobody"
  if (key.startsWith("agent:")) return nameOf({ kind: "agent", type: key.slice(6) }, people)
  if (key.startsWith("user:")) return nameOf({ kind: "user", id: key.slice(5) }, people)
  return key
}

function fmtDay(iso: unknown): string {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return String(iso ?? "")
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

/** What happened, in words (actor name is rendered separately, before this). */
export function describeActivity(a: ActivityItem, people: TaskPerson[]): string {
  const md = (a.metadata ?? {}) as Record<string, unknown>
  switch (a.action) {
    case "database.row_created":
      return "created this task"
    case "database.assigned": {
      const list = Array.isArray(md.assigned) ? md.assigned.map((k) => keyName(k, people)) : []
      return list.length ? `assigned ${list.join(", ")}` : "assigned someone"
    }
    case "database.status_changed":
    case "database.row_moved":
      return `changed status ${String(md.from ?? "?")} → ${String(md.to ?? "?")}`
    case "database.due_changed":
      return md.to ? `set the due date to ${fmtDay(md.to)}` : "removed the due date"
    case "database.owner_changed":
      return md.to ? `made ${keyName(md.to, people)} the owner` : "removed the owner"
    case "database.row_commented":
      return "commented"
    case "database.row_updated":
      return "updated the task"
    case "database.automation":
      return a.summary
    case "mention":
      return "mentioned someone"
    default:
      return a.summary
  }
}

/** This task's activity, newest first (max 30 from the endpoint). */
export function TaskActivity({ docId, rowId, people, refreshKey }: { docId: string; rowId: string; people: TaskPerson[]; refreshKey?: number }) {
  const [items, setItems] = useState<ActivityItem[] | null>(null)
  useEffect(() => {
    let alive = true
    fetch(`/api/workspace/${docId}/activity?targetType=database-row&targetId=${encodeURIComponent(rowId)}`, {
      headers: collabAuthHeaders(),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive) setItems(Array.isArray(j?.activities) ? j.activities : [])
      })
      .catch(() => {
        if (alive) setItems([])
      })
    return () => {
      alive = false
    }
  }, [docId, rowId, refreshKey])
  if (items === null) return <div className="py-6 text-center text-[12px] text-white/30">Loading…</div>
  // Mentions are already visible as chips in the comment itself.
  const shown = items.filter((a) => a.action !== "mention")
  if (shown.length === 0) return <div className="rounded-xl border border-dashed border-white/10 py-6 text-center text-[12px] text-white/30">No activity yet.</div>
  return (
    <ol className="flex flex-col gap-1">
      {shown.map((a) => (
        <li key={a.id} className="flex items-start gap-2 rounded-xl px-1 py-1.5">
          <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-white/25" />
          <div className="min-w-0 flex-1 text-[12px] leading-snug text-white/60">
            <span className="font-medium text-white/80">{actorName(a, people)}</span> {describeActivity(a, people)}
            <div className="mt-0.5 text-[10.5px] text-white/25">
              {new Date(a.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
