"use client"

/**
 * Timeline (Gantt) view (ADR-019 P6): one row per task, weeks across.
 *
 * Cross-room: a header row per room (deadline marker, unscheduled count),
 * then its tasks, a Notes row and an Agent jobs row. Room mode drops the
 * headers and draws the deadline as a line through every row.
 *
 * Editable tasks drag: grab the middle to move, an edge to change start or
 * due. The bar follows the pointer in whole days, with no animation (it's a
 * direct manipulation), and commits on release. A press without movement
 * opens the item.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ChevronRight, Diamond } from "lucide-react"
import { AgentAvatar } from "@/components/office/AgentAvatar"
import {
  diffDays,
  isWeekend,
  reschedule,
  shortDay,
  type Day,
  type DragMode,
  type TimelineGroup,
  type TimelineItem,
} from "@/lib/timeline"
import { forLabel, itemTone, type KindFilter } from "@/components/timeline/timelineUi"

export const DAY_W = 36
const LEFT_W = 248
const ROW_H = 34
const EDGE_PX = 7
const DRAG_THRESHOLD_PX = 4

type Row =
  | { key: string; type: "header"; group: TimelineGroup }
  | { key: string; type: "task"; group: TimelineGroup; item: TimelineItem }
  | { key: string; type: "notes"; group: TimelineGroup; items: TimelineItem[] }
  | { key: string; type: "jobs"; group: TimelineGroup; items: TimelineItem[] }
  | { key: string; type: "requests-header" }
  | { key: string; type: "request"; item: TimelineItem }

interface DragState {
  item: TimelineItem
  mode: DragMode
  originX: number
  delta: number
  moved: boolean
}

export default function GanttView({
  groups,
  requests,
  days,
  today,
  filters,
  crossRoom,
  selfId,
  onCommit,
  onOpen,
}: {
  groups: TimelineGroup[]
  requests: TimelineItem[]
  days: Day[]
  today: Day
  filters: Set<KindFilter>
  crossRoom: boolean
  selfId: string | null
  onCommit: (item: TimelineItem, mode: DragMode, delta: number) => void
  onOpen: (item: TimelineItem, at: { x: number; y: number }) => void
}) {
  const from = days[0]
  const to = days[days.length - 1]
  const scrollRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [drag, setDrag] = useState<DragState | null>(null)

  const rows = useMemo(() => {
    const out: Row[] = []
    if (crossRoom && filters.has("request") && requests.length > 0) {
      out.push({ key: "requests", type: "requests-header" })
      if (!collapsed.has("requests")) for (const r of requests) out.push({ key: r.id, type: "request", item: r })
    }
    for (const g of groups) {
      if (crossRoom) out.push({ key: `h:${g.roomId}`, type: "header", group: g })
      if (crossRoom && collapsed.has(g.roomId)) continue
      if (filters.has("task")) {
        const tasks = g.items.filter((i) => i.kind === "task").sort((a, b) => (a.start === b.start ? a.end.localeCompare(b.end) : a.start.localeCompare(b.start)))
        for (const t of tasks) out.push({ key: t.id, type: "task", group: g, item: t })
      }
      const notes = g.items.filter((i) => i.kind === "note")
      if (filters.has("note") && notes.length > 0) out.push({ key: `n:${g.roomId}`, type: "notes", group: g, items: notes })
      const jobs = g.items.filter((i) => i.kind === "job")
      if (filters.has("job") && jobs.length > 0) out.push({ key: `j:${g.roomId}`, type: "jobs", group: g, items: jobs })
    }
    return out
  }, [groups, requests, filters, crossRoom, collapsed])

  // Bring today into view once per window.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const idx = diffDays(from, today)
    el.scrollLeft = idx >= 0 && idx < days.length ? Math.max(0, idx * DAY_W - DAY_W * 3) : 0
  }, [from, today, days.length])

  const width = LEFT_W + days.length * DAY_W
  const col = (d: Day) => diffDays(from, d)
  const todayIdx = col(today)

  const toggle = (key: string) =>
    setCollapsed((cur) => {
      const next = new Set(cur)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const startDrag = (e: React.PointerEvent<HTMLElement>, item: TimelineItem) => {
    if (e.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    let mode: DragMode = "move"
    if (item.editable && rect.width > EDGE_PX * 3) {
      if (x <= EDGE_PX) mode = "start"
      else if (x >= rect.width - EDGE_PX) mode = "end"
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ item, mode, originX: e.clientX, delta: 0, moved: false })
  }

  const moveDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (!drag) return
    const dx = e.clientX - drag.originX
    const moved = drag.moved || Math.abs(dx) > DRAG_THRESHOLD_PX
    const delta = drag.item.editable && moved ? Math.round(dx / DAY_W) : 0
    if (delta !== drag.delta || moved !== drag.moved) setDrag({ ...drag, delta, moved })
  }

  const endDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (!drag) return
    const d = drag
    setDrag(null)
    if (!d.moved) onOpen(d.item, { x: e.clientX, y: e.clientY })
    else if (d.delta !== 0) onCommit(d.item, d.mode, d.delta)
  }

  /** Left/width in px for [start, end] clipped to the window. */
  const span = (start: Day, end: Day) => {
    const a = Math.max(0, col(start))
    const b = Math.min(days.length - 1, col(end))
    return { left: a * DAY_W, width: Math.max(1, b - a + 1) * DAY_W, clipStart: col(start) < 0, clipEnd: col(end) > days.length - 1 }
  }

  const bar = (item: TimelineItem) => {
    const live = drag && drag.item.id === item.id ? reschedule(item, drag.mode, drag.delta) : null
    const start = live?.start ?? item.start
    const end = live?.end ?? item.end
    if (end < from || start > to) return null
    const s = span(start, end)
    const editable = Boolean(item.editable)
    const who = forLabel(item, selfId)
    return (
      <button
        type="button"
        onPointerDown={(e) => startDrag(e, item)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            const r = e.currentTarget.getBoundingClientRect()
            onOpen(item, { x: r.left, y: r.bottom })
          }
        }}
        title={`${item.title} · ${start === end ? shortDay(start) : `${shortDay(start)} to ${shortDay(end)}`}${who ? ` · ${who}` : ""}`}
        className={`group absolute top-[5px] flex h-[24px] touch-none select-none items-center gap-1.5 overflow-hidden px-2 text-left text-[11.5px] ${itemTone(item)} ${
          s.clipStart ? "rounded-l-none" : "rounded-l-md"
        } ${s.clipEnd ? "rounded-r-none" : "rounded-r-md"} ${editable ? (drag?.item.id === item.id ? "cursor-grabbing" : "cursor-grab") : "cursor-pointer"} ${
          drag?.item.id === item.id && drag.moved ? "z-20 shadow-[0_6px_18px_rgba(0,0,0,.45)]" : ""
        }`}
        style={{ left: s.left + 2, width: s.width - 4 }}
      >
        {editable && !s.clipStart && <span className="absolute inset-y-1 left-0.5 w-[3px] rounded-full bg-white/0 group-hover:bg-white/30" aria-hidden />}
        <span className="truncate">{item.title}</span>
        {item.assignee && s.width > DAY_W * 3 && <span className="ml-auto shrink-0 truncate text-[10.5px] opacity-60">{item.assignee}</span>}
        {editable && !s.clipEnd && <span className="absolute inset-y-1 right-0.5 w-[3px] rounded-full bg-white/0 group-hover:bg-white/30" aria-hidden />}
      </button>
    )
  }

  const chips = (items: TimelineItem[], kind: "note" | "job") => {
    const byDay = new Map<Day, TimelineItem[]>()
    for (const i of items) {
      if (i.start < from || i.start > to) continue
      byDay.set(i.start, [...(byDay.get(i.start) ?? []), i])
    }
    return [...byDay.entries()].map(([day, list]) => {
      const left = col(day) * DAY_W
      if (kind === "job") {
        const total = list.reduce((n, j) => n + (j.count ?? 0), 0)
        const failed = list.some((j) => j.failed)
        const first = list[0]
        return (
          <button
            key={day}
            type="button"
            onClick={(e) => onOpen(list.length === 1 ? first : { ...first, title: list.map((j) => j.title).join("\n"), count: total }, { x: e.clientX, y: e.clientY })}
            title={list.map((j) => j.title).join("\n")}
            className={`absolute top-[6px] flex h-[22px] items-center justify-center rounded-full text-[10.5px] tabular-nums transition-transform duration-150 ease-out active:scale-[0.95] ${failed ? "bg-red-400/20 text-red-100" : "bg-white/[0.07] text-white/65 hover:bg-white/[0.12]"}`}
            style={{ left: left + 5, width: DAY_W - 10 }}
          >
            {total}
          </button>
        )
      }
      const mine = list.some((n) => n.forKind === "member" && selfId && n.forId === selfId)
      return (
        <button
          key={day}
          type="button"
          onClick={(e) => onOpen(list[0], { x: e.clientX, y: e.clientY })}
          title={list.map((n) => `${n.title}${forLabel(n, selfId) ? ` · ${forLabel(n, selfId)}` : ""}`).join("\n")}
          className={`absolute top-[6px] flex h-[22px] items-center justify-center rounded-md text-[10.5px] tabular-nums transition-transform duration-150 ease-out active:scale-[0.95] ${itemTone(list[0])} ${mine ? "ring-2 ring-violet-300/60" : ""}`}
          style={{ left: left + 4, width: DAY_W - 8 }}
          aria-label={`${list.length} ${list.length === 1 ? "note" : "notes"} on ${shortDay(day)}`}
        >
          {list.length}
        </button>
      )
    })
  }

  const gridBg = (
    <div className="pointer-events-none absolute inset-y-0 flex" style={{ left: LEFT_W }} aria-hidden>
      {days.map((d) => (
        <div key={d} className={`h-full border-r border-white/[0.035] ${isWeekend(d) ? "bg-white/[0.018]" : ""}`} style={{ width: DAY_W }} />
      ))}
    </div>
  )

  // Month labels above the day numbers.
  const months: { label: string; start: number; len: number }[] = []
  days.forEach((d, i) => {
    const label = new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
    const last = months[months.length - 1]
    if (last && last.label === label) last.len++
    else months.push({ label, start: i, len: 1 })
  })

  const roomDeadline = !crossRoom ? groups[0]?.deadline : null

  return (
    <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
      <div className="relative" style={{ width, minHeight: "100%" }}>
        {gridBg}
        {todayIdx >= 0 && todayIdx < days.length && (
          <div className="pointer-events-none absolute inset-y-0 z-[5] w-px bg-sky-300/60" style={{ left: LEFT_W + todayIdx * DAY_W + DAY_W / 2 }} aria-hidden />
        )}
        {roomDeadline && col(roomDeadline) >= 0 && col(roomDeadline) < days.length && (
          <div
            className="pointer-events-none absolute inset-y-0 z-[4] border-l border-dashed border-amber-300/50"
            style={{ left: LEFT_W + col(roomDeadline) * DAY_W + DAY_W / 2 }}
            title={`Project deadline · ${shortDay(roomDeadline)}`}
            aria-hidden
          />
        )}

        <div className="sticky top-0 z-30 flex border-b border-line bg-surface-1/95 backdrop-blur-sm">
          <div className="sticky left-0 z-10 shrink-0 border-r border-line bg-surface-1 px-4 pt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-white/30" style={{ width: LEFT_W }}>
            {crossRoom ? "Room and task" : "Task"}
          </div>
          <div>
            <div className="flex h-6 items-end">
              {months.map((m) => (
                <div key={m.label + m.start} className="truncate px-2 text-[11px] text-white/45" style={{ width: m.len * DAY_W }}>
                  {m.label}
                </div>
              ))}
            </div>
            <div className="flex h-7">
              {days.map((d) => (
                <div
                  key={d}
                  className={`flex items-center justify-center text-[11px] tabular-nums ${d === today ? "font-semibold text-sky-200" : isWeekend(d) ? "text-white/25" : "text-white/45"}`}
                  style={{ width: DAY_W }}
                >
                  {d === today ? <span className="rounded-full bg-sky-400/20 px-1.5 py-px">{Number(d.slice(8))}</span> : Number(d.slice(8))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {rows.map((row) => {
          if (row.type === "header" || row.type === "requests-header") {
            const isReq = row.type === "requests-header"
            const key = isReq ? "requests" : row.group.roomId
            const open = !collapsed.has(key)
            const g = isReq ? null : row.group
            const dl = g?.deadline && col(g.deadline) >= 0 && col(g.deadline) < days.length ? col(g.deadline) : null
            return (
              <div key={row.key} className="relative flex border-t border-line bg-white/[0.015]" style={{ height: ROW_H + 2 }}>
                <div className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-line bg-[#1b1b1e] pl-2 pr-3" style={{ width: LEFT_W }}>
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    aria-expanded={open}
                    aria-label={open ? "Collapse" : "Expand"}
                    className="rounded p-0.5 text-white/35 hover:bg-white/[0.06] hover:text-white/70"
                  >
                    <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-150 ease-out ${open ? "rotate-90" : ""}`} />
                  </button>
                  {g ? (
                    <Link href={`/workspace/${g.roomId}`} className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-white/85 hover:text-white">
                      {g.title}
                    </Link>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-amber-100/85">Waiting for approval</span>
                  )}
                  {g && g.unscheduled > 0 && (
                    <Link href={`/workspace/${g.roomId}?tab=tasks`} className="shrink-0 text-[10.5px] text-white/30 hover:text-white/60" title="Tasks without dates">
                      {g.unscheduled} undated
                    </Link>
                  )}
                </div>
                {dl !== null && g?.deadline && (
                  <div
                    className="absolute top-1/2 z-[6] flex -translate-y-1/2 items-center gap-1 text-[10.5px] text-amber-200"
                    style={{ left: LEFT_W + dl * DAY_W + DAY_W / 2 - 6 }}
                    title={`Project deadline · ${shortDay(g.deadline)}`}
                  >
                    <Diamond className="h-3 w-3 fill-amber-300/80 text-amber-300" />
                    <span className="whitespace-nowrap">Deadline</span>
                  </div>
                )}
              </div>
            )
          }
          const label =
            row.type === "task" ? (
              <>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/70">{row.item.title}</span>
                {!row.item.editable && <span className="sr-only">(view only)</span>}
              </>
            ) : row.type === "request" ? (
              <>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/70">{row.item.title}</span>
                <span className="shrink-0 text-[10.5px] text-white/30">{row.item.teamName}</span>
              </>
            ) : row.type === "notes" ? (
              <span className="text-[12px] text-violet-200/60">Notes</span>
            ) : (
              <span className="flex items-center gap-1.5 text-[12px] text-white/45">
                {[...new Set(row.items.map((j) => j.agentType ?? ""))].slice(0, 3).map((a) => (
                  <AgentAvatar key={a} type={a} size={16} />
                ))}
                Agent jobs
              </span>
            )
          return (
            <div key={row.key} className="relative flex border-t border-white/[0.03]" style={{ height: ROW_H }}>
              <div className={`sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-line bg-surface-1 ${crossRoom ? "pl-8" : "pl-4"} pr-3`} style={{ width: LEFT_W }}>
                {label}
              </div>
              <div className="relative flex-1">
                {row.type === "task" || row.type === "request"
                  ? bar(row.item)
                  : row.type === "notes"
                    ? chips(row.items, "note")
                    : chips(row.items, "job")}
              </div>
            </div>
          )
        })}

        {rows.length === 0 && (
          <div className="sticky left-0 flex h-48 items-center justify-center px-6 text-center text-[13px] text-white/35" style={{ width: "min(100%, 100vw)" }}>
            Nothing scheduled in these weeks. Give tasks a start or due date and they&apos;ll show here.
          </div>
        )}
      </div>
    </div>
  )
}
