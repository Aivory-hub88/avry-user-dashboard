"use client"
/**
 * Create / edit a Room group (an Agent Team, ADR-020) without leaving the
 * Console — the WhatsApp "New group" flow: pick the agents, name it, done.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { AgentAvatar } from "@/components/office/AgentAvatar"
import type { AgentTeam } from "@/lib/agentTeams"

export interface GroupCandidate {
  type: string
  name: string
  title: string
}

interface RoomGroupModalProps {
  /** Agents that can be put in a group (the Room's own agents). */
  candidates: GroupCandidate[]
  /** Editing this group; omit to create a new one. */
  group?: AgentTeam | null
  onClose: () => void
  onCreate: (name: string, agentTypes: string[]) => Promise<unknown>
  onSave: (id: string, name: string, agentTypes: string[]) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
}

export const MIN_GROUP_AGENTS = 2

export default function RoomGroupModal({ candidates, group = null, onClose, onCreate, onSave, onDelete }: RoomGroupModalProps) {
  const editing = !!group
  const [name, setName] = useState(group?.name ?? "")
  const [picked, setPicked] = useState<string[]>(group?.agent_types ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // Members that are no longer among the Room's agents stay listed so an edit
  // never silently drops them.
  const rows = useMemo(() => {
    const known = new Set(candidates.map((c) => c.type))
    const extra = picked.filter((t) => !known.has(t)).map((t) => ({ type: t, name: t, title: "" }))
    return [...candidates, ...extra]
  }, [candidates, picked])

  const toggle = (type: string) =>
    setPicked((cur) => (cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type]))

  const trimmed = name.trim()
  const canSubmit = trimmed.length > 0 && picked.length >= MIN_GROUP_AGENTS && !busy

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editing ? "Group info" : "New group"}
        className="flex max-h-[85vh] w-full max-w-[440px] flex-col rounded-2xl border border-white/10 bg-[#161618] shadow-2xl"
      >
        <div className="border-b border-white/[0.06] px-5 py-4">
          <div className="text-[15px] font-medium text-white/90">{editing ? "Group info" : "New group"}</div>
          <div className="mt-0.5 text-[12px] text-white/40">
            Agents in a group work only with each other in this room.
          </div>
        </div>

        <div className="px-5 pt-4">
          <input
            ref={nameRef}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) void run(() => (group ? onSave(group.id, trimmed, picked) : onCreate(trimmed, picked)))
            }}
            placeholder="Group name"
            aria-label="Group name"
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] text-white/90 outline-none placeholder:text-white/30 focus:border-white/25"
          />
        </div>

        <div className="px-5 pb-1 pt-4 text-[11px] uppercase tracking-wider text-white/35">
          Add agents · {picked.length} selected
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" role="listbox" aria-multiselectable="true" aria-label="Agents">
          {rows.map((c) => {
            const on = picked.includes(c.type)
            return (
              <li key={c.type}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  disabled={busy}
                  onClick={() => toggle(c.type)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.05] disabled:opacity-60"
                >
                  <AgentAvatar type={c.type} size={34} className="rounded-full" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-white/90">{c.name}</span>
                    {c.title && <span className="block truncate text-[11px] text-white/40">{c.title}</span>}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
                      on ? "border-[#b7cba6] bg-[#b7cba6] text-black" : "border-white/25 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        {error && (
          <div role="alert" className="mx-5 mb-2 text-[12px] text-amber-300/90">
            {error}
          </div>
        )}
        {!error && picked.length < MIN_GROUP_AGENTS && (
          <div className="mx-5 mb-2 text-[12px] text-white/35">Pick at least {MIN_GROUP_AGENTS} agents.</div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] px-5 py-3">
          {editing && group ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Delete “${group.name}”? The room goes back to all your agents.`)) void run(() => onDelete(group.id))
              }}
              className="text-[12px] text-red-300/80 hover:text-red-300 disabled:opacity-50"
            >
              Delete group
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-full px-4 py-1.5 text-[12px] text-white/60 hover:bg-white/[0.06]">
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void run(() => (group ? onSave(group.id, trimmed, picked) : onCreate(trimmed, picked)))}
              className="rounded-full bg-[#b7cba6] px-4 py-1.5 text-[12px] font-medium text-black transition-transform duration-150 ease-out active:scale-[0.97] disabled:opacity-40"
            >
              {busy ? "Saving…" : editing ? "Save" : "Create group"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
