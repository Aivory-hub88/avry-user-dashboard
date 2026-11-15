"use client"

/**
 * Pick a task row from the same doc (dependencies "Blocked by", "Sub-task
 * of"). Same popover pattern as the people picker: a trigger button, a
 * portal with a search box, closes on outside click / Escape / scroll.
 * The caller passes only rows that are valid choices.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Search } from "lucide-react"

export type PickableRow = { id: string; title: string; status: string }

const STATUS_DOT: Record<string, string> = {
  Todo: "bg-white/40",
  Doing: "bg-amber-400",
  Done: "bg-emerald-400",
}

type Props = {
  candidates: PickableRow[]
  onPick: (id: string) => void
  children: ReactNode
  className?: string
  title?: string
  /** Search box placeholder and dialog label. */
  label: string
  empty?: string
}

export function TaskRowPicker({ candidates, onPick, children, className = "", title, label, empty = "No tasks match." }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const width = 280
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

  const needle = q.trim().toLowerCase()
  const hits = candidates.filter((r) => !needle || (r.title || "Untitled").toLowerCase().includes(needle)).slice(0, 50)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title={title}
        onClick={() => {
          setQ("")
          setOpen((o) => !o)
        }}
        className={className}
      >
        {children}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label={label}
            className="fixed z-[60] w-[280px] rounded-xl border border-line bg-[#1f1f1d] p-2 shadow-2xl"
            style={{ top: pos.top, left: pos.left }}
          >
            <label className="mb-1.5 flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-2 py-1.5">
              <Search className="h-3.5 w-3.5 text-white/30" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={label}
                className="w-full bg-transparent text-[12px] text-white/80 placeholder:text-white/30 outline-none"
              />
            </label>
            <div className="max-h-[250px] overflow-y-auto">
              {hits.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    onPick(r.id)
                    setOpen(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-white/75 hover:bg-white/[0.06]"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[r.status] ?? "bg-white/40"}`} />
                  <span className="min-w-0 flex-1 truncate">{r.title || "Untitled"}</span>
                  <span className="text-[10px] uppercase tracking-wider text-white/30">{r.status}</span>
                </button>
              ))}
              {hits.length === 0 && <div className="px-2 py-3 text-center text-[12px] text-white/30">{empty}</div>}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
