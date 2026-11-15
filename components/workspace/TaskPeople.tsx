"use client"

/**
 * People on a task: avatars, an avatar stack, and the picker used for
 * assignees (people + agents, many) and the owner (one person).
 *
 * Names always resolve live from the room's people list by id, so a renamed
 * member shows their current name; the name stored on the ref is only a
 * fallback for people who have since left the room.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Check, Search, X } from "lucide-react"
import { AgentAvatar } from "@/components/office/AgentAvatar"
import { AGENT_ROSTER } from "@/lib/agentRoster"
import { personKey, type PersonRef } from "@/lib/workspaceDbModel"

export type TaskPerson = { id: string; name: string }
export type TaskAgent = { type: string; name: string }

export function nameOf(p: PersonRef, people: TaskPerson[]): string {
  if (p.kind === "agent") return AGENT_ROSTER.find((a) => a.type === p.type)?.name ?? p.type
  return people.find((x) => x.id === p.id)?.name || p.name || "Member"
}

export function PersonAvatar({ person, people, size = 22, ring = false }: { person: PersonRef; people: TaskPerson[]; size?: number; ring?: boolean }) {
  const name = nameOf(person, people)
  const ringCls = ring ? "ring-2 ring-[#1a1a18]" : ""
  if (person.kind === "agent") {
    return (
      <span title={`${name} (agent)`} className={`inline-flex shrink-0 rounded-full ${ringCls}`}>
        <AgentAvatar type={person.type} size={size} />
      </span>
    )
  }
  return (
    <span
      title={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white/[0.12] font-medium text-white/70 ${ringCls}`}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.45)) }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

/** Overlapping avatars, max `max` shown plus a "+n" bubble. */
export function AvatarStack({ list, people, size = 22, max = 3 }: { list: PersonRef[]; people: TaskPerson[]; size?: number; max?: number }) {
  const shown = list.slice(0, max)
  const extra = list.length - shown.length
  return (
    <span className="inline-flex items-center">
      {shown.map((p, i) => (
        <span key={personKey(p)} style={{ marginLeft: i === 0 ? 0 : -6 }}>
          <PersonAvatar person={p} people={people} size={size} ring />
        </span>
      ))}
      {extra > 0 && (
        <span
          className="ml-[-6px] inline-flex items-center justify-center rounded-full bg-white/[0.10] text-[10px] font-medium text-white/60 ring-2 ring-[#1a1a18]"
          style={{ width: size, height: size }}
        >
          +{extra}
        </span>
      )}
    </span>
  )
}

/** Comma list of names, for single-line cells and titles. */
export function namesOf(list: PersonRef[], people: TaskPerson[]): string {
  return list.map((p) => nameOf(p, people)).join(", ")
}

type PickerProps = {
  value: PersonRef[]
  onChange: (next: PersonRef[]) => void
  people: TaskPerson[]
  agents: TaskAgent[]
  /** Owner mode: exactly one person, agents hidden. */
  single?: boolean
  readOnly?: boolean
  max?: number
  /** Legacy free-text assignee still on the row (shown so it can be replaced). */
  unlinked?: string
  /** The clickable thing that opens the picker. */
  children: ReactNode
  className?: string
  title?: string
}

/**
 * Popover picker. Rendered in a portal with fixed positioning so table and
 * board scroll containers can't clip it.
 */
export function PeoplePicker({ value, onChange, people, agents, single = false, readOnly = false, max = 5, unlinked, children, className = "", title }: PickerProps) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const width = 260
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
    const below = r.bottom + 4
    const top = below + 320 > window.innerHeight ? Math.max(8, r.top - 324) : below
    setPos({ top, left })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    const onScroll = (e: Event) => {
      if (popRef.current && e.target instanceof Node && popRef.current.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", onScroll)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onScroll)
    }
  }, [open])

  const keys = new Set(value.map(personKey))
  const needle = q.trim().toLowerCase()
  const peopleHits = people.filter((p) => !needle || p.name.toLowerCase().includes(needle))
  const agentHits = single ? [] : agents.filter((a) => !needle || a.name.toLowerCase().includes(needle))
  // People already on the task but no longer in the room stay removable.
  const strays = value.filter((p) => p.kind === "user" && !people.some((x) => x.id === p.id))

  const toggle = (p: PersonRef) => {
    const k = personKey(p)
    if (single) {
      onChange(keys.has(k) ? [] : [p])
      setOpen(false)
      return
    }
    if (keys.has(k)) onChange(value.filter((x) => personKey(x) !== k))
    else if (value.length < max) onChange([...value, p])
  }

  const row = (p: PersonRef, label: string, sub?: string) => {
    const on = keys.has(personKey(p))
    const full = !on && !single && value.length >= max
    return (
      <button
        key={personKey(p)}
        type="button"
        disabled={full}
        onClick={() => toggle(p)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-white/75 hover:bg-white/[0.06] disabled:opacity-35"
      >
        <PersonAvatar person={p} people={people} size={20} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {sub && <span className="text-[10px] uppercase tracking-wider text-white/30">{sub}</span>}
        {on && <Check className="h-3.5 w-3.5 text-white/70" />}
      </button>
    )
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={readOnly}
        title={title}
        onClick={() => {
          if (readOnly) return
          setQ("")
          setOpen((o) => !o)
        }}
        className={className}
      >
        {children}
      </button>
      {open && pos &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label={single ? "Choose owner" : "Choose assignees"}
            className="fixed z-[60] w-[260px] rounded-xl border border-line bg-[#1f1f1d] p-2 shadow-2xl"
            style={{ top: pos.top, left: pos.left }}
          >
            <label className="mb-1.5 flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-2 py-1.5">
              <Search className="h-3.5 w-3.5 text-white/30" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={single ? "Find a person" : "Find people or agents"}
                className="w-full bg-transparent text-[12px] text-white/80 placeholder:text-white/30 outline-none"
              />
            </label>
            <div className="max-h-[250px] overflow-y-auto">
              {unlinked && !single && (
                <div className="mb-1 flex items-center gap-2 rounded-lg border border-dashed border-white/10 px-2 py-1.5 text-[11.5px] text-white/40">
                  <span className="min-w-0 flex-1 truncate">“{unlinked}” isn&apos;t linked to anyone</span>
                  <button type="button" onClick={() => onChange([])} title="Clear" className="text-white/30 hover:text-white/70">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              {peopleHits.length > 0 && <div className="px-2 pb-1 pt-1.5 text-[10px] uppercase tracking-wider text-white/30">People</div>}
              {peopleHits.map((p) => row({ kind: "user", id: p.id, name: p.name }, p.name))}
              {strays.map((p) => row(p, nameOf(p, people), "left"))}
              {agentHits.length > 0 && <div className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-wider text-white/30">Agents</div>}
              {agentHits.map((a) => row({ kind: "agent", type: a.type }, a.name, "agent"))}
              {peopleHits.length === 0 && agentHits.length === 0 && strays.length === 0 && (
                <div className="px-2 py-3 text-center text-[12px] text-white/30">No one matches.</div>
              )}
            </div>
            {!single && (
              <div className="mt-1 border-t border-line px-2 pt-1.5 text-[10.5px] text-white/30">
                {value.length}/{max} assigned
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
