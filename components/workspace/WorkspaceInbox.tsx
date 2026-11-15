"use client"

/**
 * Workspace inbox bell: unread task assignments, @mentions, notices about
 * tasks the viewer follows (comments, Done, due changes) and due reminders
 * (GET /api/workspace/notifications — rows created after the read watermark).
 * Clicking an item opens the task in its room; "Mark all read" advances the
 * watermark. Polls once a minute while mounted.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Bell } from "lucide-react"
import { collabAuthHeaders } from "@/lib/collabClient"
import { personName } from "@/lib/roomChat"
import { AGENT_ROSTER } from "@/lib/agentRoster"

type InboxItem = {
  id: number | string
  doc_id: string
  row_id: string | null
  actor_type: string
  actor_id: string | null
  actor_name: string | null
  source: string
  excerpt: string
  created_at: string
}

const POLL_MS = 60_000

function actorLabel(m: InboxItem): string {
  if (m.actor_type === "agent") return AGENT_ROSTER.find((a) => a.type === m.actor_id)?.name ?? "An agent"
  return personName(m.actor_name ?? "")
}

/** What the notice says after the actor's name (per inbox source). */
export function inboxVerb(source: string): string {
  switch (source) {
    case "assigned":
      return "assigned you a task"
    case "commented":
      return "commented on a task you follow"
    case "status_done":
      return "marked a task you follow as Done"
    case "due_changed":
      return "changed the due date of a task you follow"
    case "unblocked":
      return "finished the last blocker — your task can start"
    case "due_soon":
      return "Due tomorrow"
    case "overdue":
      return "Overdue"
    default:
      return "mentioned you"
  }
}

/** Reminders come from the system, not a person. */
function isReminder(source: string): boolean {
  return source === "due_soon" || source === "overdue"
}

function hrefOf(m: InboxItem): string {
  const base = `/workspace/${encodeURIComponent(m.doc_id.replace(/^workspace:(room:|db:)?/, ""))}`
  return m.row_id ? `${base}?tab=tasks&task=${encodeURIComponent(m.row_id)}` : base
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return "now"
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export default function WorkspaceInbox() {
  const [items, setItems] = useState<InboxItem[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/workspace/notifications", { headers: collabAuthHeaders() })
      if (!r.ok) return
      const j = (await r.json()) as { mentions?: InboxItem[] }
      setItems(Array.isArray(j.mentions) ? j.mentions : [])
    } catch {}
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    const t = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const markAllRead = async () => {
    setItems([])
    try {
      await fetch("/api/workspace/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
        body: JSON.stringify({ markRead: true }),
      })
    } catch {}
  }

  const unread = items.length

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o)
          if (!open) void load()
        }}
        aria-label={unread ? `Inbox, ${unread} unread` : "Inbox"}
        title="Inbox: assignments, mentions and tasks you follow"
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-white/50 hover:bg-white/[0.06] hover:text-white/80"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-amber-400 px-1 text-center text-[10px] font-semibold leading-4 text-black tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-[320px] rounded-xl border border-line bg-[#1f1f1d] p-1.5 shadow-2xl">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-white/40">Inbox</span>
            {unread > 0 && (
              <button type="button" onClick={markAllRead} className="text-[11px] text-white/45 hover:text-white/80">
                Mark all read
              </button>
            )}
          </div>
          {unread === 0 ? (
            <div className="px-2 py-6 text-center text-[12px] text-white/35">You&apos;re all caught up.</div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto">
              {items.map((m) => (
                <Link
                  key={m.id}
                  href={hrefOf(m)}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-2 py-2 hover:bg-white/[0.05]"
                >
                  <div className="flex items-baseline justify-between gap-2 text-[12.5px] text-white/75">
                    <span className="min-w-0 truncate">
                      {isReminder(m.source) ? (
                        <span className={`font-medium ${m.source === "overdue" ? "text-red-300" : "text-amber-200"}`}>{inboxVerb(m.source)}</span>
                      ) : (
                        <>
                          <span className="font-medium text-white/85">{actorLabel(m)}</span> {inboxVerb(m.source)}
                        </>
                      )}
                    </span>
                    <span className="shrink-0 text-[10.5px] text-white/30">{ago(m.created_at)}</span>
                  </div>
                  {m.excerpt && <div className="mt-0.5 truncate text-[12px] text-white/40">{m.excerpt}</div>}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
