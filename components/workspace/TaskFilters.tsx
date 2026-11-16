"use client"

/**
 * The Tasks toolbar's secondary filters (priority, due date, people and one
 * per person field) in a single popover, so the toolbar stays one short row
 * however many person fields a room has. Status, search and sort stay inline.
 * The button shows how many filters are on; "Clear" resets them all.
 */

import { useEffect, useRef, useState } from "react"
import { ListFilter } from "lucide-react"
import { DUE_FILTERS, activeFilterCount, type FieldDef } from "@/lib/workspaceDbModel"

const PRIORITIES = ["Low", "Med", "High"] as const

type Person = { id: string; name: string }
type AgentOpt = { type: string; name: string }

export type TaskFiltersProps = {
  priority: string
  due: string
  people: string
  /** Active person-field filters ("All" entries may be absent). */
  fieldFilters: Record<string, string>
  personFields: FieldDef[]
  members: Person[]
  agents: AgentOpt[]
  /** The viewer's user id (enables the "Me" options). */
  selfId?: string | null
  onPriority: (v: string) => void
  onDue: (v: string) => void
  onPeople: (v: string) => void
  onFieldFilter: (fieldId: string, v: string) => void
  onClear: () => void
}

const SELECT = "w-full rounded-lg border border-line bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-white/70 outline-none"

function PersonOptions({ members, agents }: { members: Person[]; agents: AgentOpt[] }) {
  return (
    <>
      {members.length > 0 && (
        <optgroup label="People">
          {members.map((p) => (
            <option key={p.id} value={`user:${p.id}`}>{p.name}</option>
          ))}
        </optgroup>
      )}
      {agents.length > 0 && (
        <optgroup label="Agents">
          {agents.map((a) => (
            <option key={a.type} value={`agent:${a.type}`}>{a.name}</option>
          ))}
        </optgroup>
      )}
    </>
  )
}

export default function TaskFilters(p: TaskFiltersProps) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const count = activeFilterCount({ priority: p.priority, due: p.due, people: p.people, fieldFilters: p.fieldFilters })

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

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={count ? `Filters, ${count} active` : "Filters"}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${count ? "border-white/25 bg-white/[0.1] text-white" : "border-line bg-white/[0.04] text-white/60 hover:text-white/85"}`}
      >
        <ListFilter className="h-3.5 w-3.5" />
        Filters
        {count > 0 && <span className="min-w-[16px] rounded-full bg-amber-400 px-1 text-center text-[10px] font-semibold leading-4 text-black tabular-nums">{count}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Task filters" className="absolute right-0 top-10 z-40 w-[min(320px,calc(100vw-2rem))] rounded-xl border border-line bg-[#1f1f1d] p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-white/40">Filters</span>
            <button type="button" onClick={p.onClear} disabled={count === 0} className="text-[11px] text-white/45 hover:text-white/80 disabled:opacity-30 disabled:hover:text-white/45">
              Clear
            </button>
          </div>
          <div className="max-h-[60vh] space-y-2.5 overflow-y-auto pr-0.5">
            <label className="block">
              <span className="mb-1 block text-[11px] text-white/40">Priority</span>
              <select value={p.priority} onChange={(e) => p.onPriority(e.target.value)} className={SELECT}>
                <option value="All">All priority</option>
                {PRIORITIES.map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-white/40">Due date</span>
              <select value={p.due} onChange={(e) => p.onDue(e.target.value)} className={SELECT}>
                {DUE_FILTERS.map((d) => (
                  <option key={d} value={d}>{d === "All" ? "All dates" : d}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-white/40">Assignee (Me also matches tasks you own)</span>
              <select value={p.people} onChange={(e) => p.onPeople(e.target.value)} className={SELECT}>
                <option value="All">All people</option>
                {p.selfId && <option value="me">Me</option>}
                <option value="unassigned">Unassigned</option>
                <PersonOptions members={p.members} agents={p.agents} />
              </select>
            </label>
            {p.personFields.map((f) => (
              <label key={f.id} className="block">
                <span className="mb-1 block truncate text-[11px] text-white/40">{f.name}</span>
                <select value={p.fieldFilters[f.id] ?? "All"} onChange={(e) => p.onFieldFilter(f.id, e.target.value)} className={SELECT} aria-label={`Filter by ${f.name}`}>
                  <option value="All">Any {f.name}</option>
                  {p.selfId && <option value="me">{f.name}: Me</option>}
                  <option value="unassigned">No {f.name}</option>
                  <PersonOptions members={p.members} agents={p.agents} />
                </select>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
