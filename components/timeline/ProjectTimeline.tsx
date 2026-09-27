"use client"

/**
 * Project timeline (ADR-019 P6): the Gantt/Month views, their toolbar and
 * the item popover. Cross-room on Workspace › Timeline, one room in the
 * room's Timeline tab (pass roomId).
 *
 * Dragging a task writes start/due through the task board's own PATCH
 * route, optimistically; a failed save puts the bar back and says so.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import GanttView from "@/components/timeline/GanttView"
import MonthView from "@/components/timeline/MonthView"
import { FILTER_LABEL, forLabel, itemHref, type KindFilter } from "@/components/timeline/timelineUi"
import { collabAuthHeaders } from "@/lib/collabClient"
import { useSelfId } from "@/hooks/useSelfId"
import {
  addDays,
  addMonths,
  dayList,
  dayRange,
  localDay,
  monthWeeks,
  reschedule,
  startOfMonth,
  startOfWeek,
  type Day,
  type DragMode,
  type TimelineItem,
  type TimelinePayload,
} from "@/lib/timeline"

type View = "timeline" | "month"
const WINDOW_DAYS = 42
const STEP_DAYS = 28

const TASK_STATUS_LABEL: Record<string, string> = { Todo: "To do", Doing: "In progress", Done: "Done" }
const REQUEST_STATUS_LABEL: Record<string, string> = { draft: "Draft", submitted: "Waiting for review", changes_requested: "Changes requested" }

interface Popover {
  item: TimelineItem
  x: number
  y: number
}

export default function ProjectTimeline({ roomId }: { roomId?: string }) {
  const crossRoom = !roomId
  const today = useMemo(() => localDay(), [])
  const selfId = useSelfId()
  const [view, setView] = useState<View>("timeline")
  const [anchor, setAnchor] = useState<Day>(() => addDays(startOfWeek(today), -7))
  const [month, setMonth] = useState<Day>(() => startOfMonth(today))
  const [data, setData] = useState<TimelinePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [filters, setFilters] = useState<Set<KindFilter>>(() => new Set<KindFilter>(["task", "note", "job", "request"]))
  const [pop, setPop] = useState<Popover | null>(null)
  const loadSeq = useRef(0)

  const range = useMemo(() => {
    if (view === "timeline") return { from: anchor, to: addDays(anchor, WINDOW_DAYS - 1) }
    const weeks = monthWeeks(month)
    return { from: weeks[0][0], to: weeks[weeks.length - 1][6] }
  }, [view, anchor, month])

  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    const qs = new URLSearchParams({ from: range.from, to: range.to, tz })
    try {
      const r = await fetch(`${roomId ? `/api/workspace/${roomId}/calendar` : "/api/workspace/calendar"}?${qs}`, {
        headers: collabAuthHeaders(),
        cache: "no-store",
      })
      if (!r.ok) throw new Error(String(r.status))
      const j = (await r.json()) as TimelinePayload
      if (seq !== loadSeq.current) return
      setData(j)
      setError(null)
    } catch {
      if (seq === loadSeq.current) setError("The timeline couldn't load. Try again in a moment.")
    }
  }, [range.from, range.to, roomId])

  useEffect(() => {
    // Fetch when the window changes; load() only sets state after its await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])

  useEffect(() => {
    if (!pop) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPop(null)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pop])

  const groups = useMemo(() => data?.groups ?? [], [data])
  const roomTitles = useMemo(() => new Map(groups.map((g) => [g.roomId, g.title])), [groups])

  const monthItems = useMemo(() => {
    const out: TimelineItem[] = []
    for (const g of groups)
      for (const i of g.items) {
        if (i.kind === "deadline" || filters.has(i.kind as KindFilter)) out.push(i)
      }
    if (crossRoom && filters.has("request")) out.push(...(data?.requests ?? []))
    return out
  }, [groups, data, filters, crossRoom])

  const commit = useCallback(
    async (item: TimelineItem, mode: DragMode, delta: number) => {
      const next = reschedule(item, mode, delta)
      if (!next || !item.roomId || !item.rowId) return
      const patchItem = (start: Day, end: Day, hasStart: boolean, hasDue: boolean) =>
        setData((cur) =>
          cur && {
            ...cur,
            groups: cur.groups.map((g) =>
              g.roomId !== item.roomId ? g : { ...g, items: g.items.map((i) => (i.id === item.id ? { ...i, start, end, hasStart, hasDue } : i)) },
            ),
          },
        )
      patchItem(next.start, next.end, item.hasStart || next.patch.start !== undefined, item.hasDue || next.patch.due !== undefined)
      try {
        const r = await fetch(`/api/workspace/${item.roomId}/database/${item.rowId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
          body: JSON.stringify(next.patch),
        })
        if (!r.ok) throw new Error(String(r.status))
        setNotice(`${item.title} moved to ${dayRange(next.start, next.end)}`)
      } catch {
        patchItem(item.start, item.end, Boolean(item.hasStart), Boolean(item.hasDue))
        setNotice(`${item.title} couldn't be moved. Try again.`)
      }
    },
    [],
  )

  const step = (dir: -1 | 1) => {
    setPop(null)
    if (view === "timeline") setAnchor((a) => addDays(a, dir * STEP_DAYS))
    else setMonth((m) => addMonths(m, dir))
  }
  const goToday = () => {
    setPop(null)
    setAnchor(addDays(startOfWeek(today), -7))
    setMonth(startOfMonth(today))
  }
  const toggleFilter = (f: KindFilter) =>
    setFilters((cur) => {
      const next = new Set(cur)
      if (next.has(f)) next.delete(f)
      else next.add(f)
      return next
    })

  const title =
    view === "month"
      ? new Date(`${month}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
      : dayRange(range.from, range.to)
  const filterKeys: KindFilter[] = crossRoom ? ["task", "note", "job", "request"] : ["task", "note", "job"]

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-full bg-white/[0.04] p-0.5" role="tablist" aria-label="Timeline view">
            {(["timeline", "month"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => {
                  setPop(null)
                  setView(v)
                }}
                className={`rounded-full px-3 py-1 text-[12px] transition-colors duration-150 ${view === v ? "bg-white text-black" : "text-white/45 hover:text-white/75"}`}
              >
                {v === "timeline" ? "Timeline" : "Month"}
              </button>
            ))}
          </div>
          <div className="ml-2 flex items-center gap-0.5">
            <button type="button" onClick={() => step(-1)} aria-label="Earlier" className="rounded-full p-1.5 text-white/45 transition-transform duration-150 ease-out hover:bg-white/[0.06] hover:text-white/80 active:scale-[0.95]">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => step(1)} aria-label="Later" className="rounded-full p-1.5 text-white/45 transition-transform duration-150 ease-out hover:bg-white/[0.06] hover:text-white/80 active:scale-[0.95]">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button type="button" onClick={goToday} className="rounded-full px-2.5 py-1 text-[12px] text-white/55 transition-transform duration-150 ease-out hover:bg-white/[0.06] hover:text-white/85 active:scale-[0.97]">
              Today
            </button>
          </div>
          <span className="ml-1 text-[13px] font-medium text-white/80">{title}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1" aria-label="Show on the timeline">
          {filterKeys.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filters.has(f)}
              onClick={() => toggleFilter(f)}
              className={`rounded-full border px-2.5 py-1 text-[11.5px] transition-colors duration-150 ${
                filters.has(f) ? "border-white/15 bg-white/[0.07] text-white/80" : "border-white/[0.06] text-white/35 hover:text-white/60"
              }`}
            >
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mx-6 mb-3 rounded-xl bg-amber-500/10 px-4 py-2.5 text-[12px] text-amber-200">{error}</div>}

      {data === null && !error ? (
        <div className="space-y-2 px-6" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-white/[0.03]" />
          ))}
        </div>
      ) : view === "timeline" ? (
        <div className="flex min-h-0 flex-1 border-t border-line">
          <GanttView
            groups={groups}
            requests={data?.requests ?? []}
            days={dayList(range.from, range.to)}
            today={today}
            filters={filters}
            crossRoom={crossRoom}
            selfId={selfId}
            onCommit={commit}
            onOpen={(item, at) => setPop({ item, ...at })}
          />
        </div>
      ) : (
        <MonthView month={month} items={monthItems} today={today} selfId={selfId} roomTitles={roomTitles} onOpen={(item, at) => setPop({ item, ...at })} />
      )}

      {crossRoom && data && groups.length === 0 && !error && (
        <div className="px-6 py-4 text-[12px] text-white/35">
          No rooms yet. Rooms open when a project request is approved.{" "}
          <Link href="/workspace/requests?new=1" className="text-white/60 underline-offset-2 hover:underline">
            Start a request
          </Link>
        </div>
      )}

      {notice && (
        <div className="notification-card-in pointer-events-none absolute bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-[12px] font-medium text-black shadow-lg" role="status">
          {notice}
        </div>
      )}

      {pop && <ItemPopover pop={pop} selfId={selfId} roomTitle={pop.item.roomId ? roomTitles.get(pop.item.roomId) ?? "" : ""} crossRoom={crossRoom} onClose={() => setPop(null)} />}
    </div>
  )
}

function ItemPopover({ pop, selfId, roomTitle, crossRoom, onClose }: { pop: Popover; selfId: string | null; roomTitle: string; crossRoom: boolean; onClose: () => void }) {
  const { item } = pop
  const W = 300
  const flipX = typeof window !== "undefined" && pop.x + W + 16 > window.innerWidth
  const flipY = typeof window !== "undefined" && pop.y + 220 > window.innerHeight
  const left = flipX ? Math.max(16, pop.x - W) : pop.x + 4
  const top = flipY ? undefined : pop.y + 8
  const bottom = flipY && typeof window !== "undefined" ? window.innerHeight - pop.y + 8 : undefined
  const href = itemHref(item)
  const who = forLabel(item, selfId)
  const meta: string[] = []
  if (item.kind === "task") {
    meta.push(TASK_STATUS_LABEL[item.status ?? ""] ?? item.status ?? "")
    if (item.assignee) meta.push(item.assignee)
  }
  if (item.kind === "request") meta.push(REQUEST_STATUS_LABEL[item.requestStatus ?? ""] ?? "", item.teamName ?? "")
  if (item.kind === "job" && item.failed) meta.push(`${item.failed} failed`)
  if (who) meta.push(who)
  const kindLabel = { task: "Task", note: "Note", job: "Agent jobs", request: "Project request", deadline: "Project deadline" }[item.kind]
  const dates = item.kind === "request" ? `Due ${dayRange(item.end, item.end)}` : dayRange(item.start, item.end)

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label={item.title}
        className="timeline-pop fixed z-50 rounded-2xl border border-white/10 bg-[#202024] p-4 shadow-[0_18px_48px_rgba(0,0,0,.5)]"
        style={
          {
            width: W,
            left,
            top,
            bottom,
            "--pop-origin": `${flipY ? "bottom" : "top"} ${flipX ? "right" : "left"}`,
          } as React.CSSProperties
        }
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-white/35">
              {kindLabel}
              {crossRoom && roomTitle ? ` · ${roomTitle}` : ""}
            </div>
            <div className="mt-1 whitespace-pre-line break-words text-[14px] font-medium text-white/90">{item.title}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 rounded-full p-1 text-white/35 hover:bg-white/[0.06] hover:text-white/75">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-2 text-[12px] text-white/55">{dates}</div>
        {meta.filter(Boolean).length > 0 && <div className="mt-1 text-[12px] text-white/45">{meta.filter(Boolean).join(" · ")}</div>}
        {item.kind === "note" && item.body && <div className="mt-3 line-clamp-6 whitespace-pre-line text-[12.5px] leading-relaxed text-white/65">{item.body}</div>}
        {item.kind === "task" && item.editable && <div className="mt-3 text-[11.5px] text-white/30">Drag the bar to move it, or its edges to change the dates.</div>}
        {href && (
          <Link
            href={href}
            className="mt-4 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[12px] font-medium text-black transition-transform duration-150 ease-out hover:bg-white/90 active:scale-[0.97]"
          >
            {item.kind === "request" ? "Open request" : item.kind === "note" ? "Open note" : item.kind === "task" ? "Open in Tasks" : "Open room"}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </>
  )
}
