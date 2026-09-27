/**
 * Project timeline model (ADR-019 P6) — shared by the API and the UI.
 *
 * Everything is a whole day ("YYYY-MM-DD", no time zone): task start/due
 * come from the room's task board, deadlines from the room brief, dated
 * notes from room_notes, agent jobs are counted per day in the viewer's
 * time zone on the server. Day maths runs in UTC so DST never shifts a bar.
 */

export type Day = string

export type TimelineKind = "task" | "deadline" | "request" | "job" | "note"

export interface TimelineItem {
  id: string
  kind: TimelineKind
  roomId: string | null
  title: string
  start: Day
  end: Day
  /** task */
  rowId?: string
  status?: string
  assignee?: string
  hasStart?: boolean
  hasDue?: boolean
  /** note */
  noteId?: string
  body?: string
  forKind?: "member" | "agent" | null
  forId?: string | null
  forName?: string
  /** job: agent turns that day */
  agentType?: string
  count?: number
  failed?: number
  /** request */
  requestId?: string
  requestStatus?: string
  teamName?: string
  /** The caller may drag it (tasks in rooms they can edit). */
  editable?: boolean
}

export interface TimelineGroup {
  roomId: string
  title: string
  teamName: string
  deadline: Day | null
  canWrite: boolean
  /** Tasks with neither a start nor a due date. */
  unscheduled: number
  items: TimelineItem[]
}

export interface TimelinePayload {
  from: Day
  to: Day
  groups: TimelineGroup[]
  /** Requests still waiting for approval (cross-room view only). */
  requests: TimelineItem[]
}

export const MAX_WINDOW_DAYS = 120

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const MS_DAY = 86_400_000

export function isDay(v: unknown): v is Day {
  if (typeof v !== "string" || !DAY_RE.test(v)) return false
  const t = Date.parse(`${v}T00:00:00Z`)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v
}

/** "2026-09-26", "2026-09-26T10:00" → "2026-09-26"; anything else → null. */
export function toDay(v: unknown): Day | null {
  if (typeof v !== "string") return null
  const d = v.slice(0, 10)
  return isDay(d) ? d : null
}

export function addDays(d: Day, n: number): Day {
  return new Date(Date.parse(`${d}T00:00:00Z`) + n * MS_DAY).toISOString().slice(0, 10)
}

/** b − a in whole days. */
export function diffDays(a: Day, b: Day): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_DAY)
}

/** Monday of d's week. */
export function startOfWeek(d: Day): Day {
  const dow = new Date(`${d}T00:00:00Z`).getUTCDay() // 0 = Sunday
  return addDays(d, -((dow + 6) % 7))
}

export function startOfMonth(d: Day): Day {
  return `${d.slice(0, 7)}-01`
}

export function addMonths(d: Day, n: number): Day {
  const [y, m] = d.split("-").map(Number)
  const idx = y * 12 + (m - 1) + n
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}-01`
}

/** The local calendar day of a Date (the viewer's own "today"). */
export function localDay(date = new Date()): Day {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function overlaps(item: { start: Day; end: Day }, from: Day, to: Day): boolean {
  return item.start <= to && item.end >= from
}

/** A sane window: both days valid, from ≤ to, at most MAX_WINDOW_DAYS. */
export function cleanWindow(from: unknown, to: unknown, today: Day): { from: Day; to: Day } {
  const f = isDay(from) ? from : addDays(startOfWeek(today), -7)
  let t = isDay(to) ? to : addDays(f, 41)
  if (t < f) t = f
  if (diffDays(f, t) > MAX_WINDOW_DAYS) t = addDays(f, MAX_WINDOW_DAYS)
  return { from: f, to: t }
}

interface TaskRowLike {
  id: string
  title: string
  status?: string
  assignee?: string
  start?: string
  due?: string
}

/** A task as a bar; null when it has no dates (counted as unscheduled). */
export function taskItem(row: TaskRowLike, roomId: string, editable: boolean): TimelineItem | null {
  const s = toDay(row.start)
  const d = toDay(row.due)
  if (!s && !d) return null
  let start = s ?? d!
  let end = d ?? s!
  if (start > end) [start, end] = [end, start]
  return {
    id: `task:${roomId}:${row.id}`,
    kind: "task",
    roomId,
    rowId: row.id,
    title: row.title?.trim() || "Untitled",
    start,
    end,
    status: row.status || "Todo",
    assignee: row.assignee || "",
    hasStart: Boolean(s),
    hasDue: Boolean(d),
    editable,
  }
}

export type DragMode = "move" | "start" | "end"

export interface Rescheduled {
  start: Day
  end: Day
  /** The row fields to PATCH (only what the drag changed). */
  patch: { start?: Day; due?: Day }
}

/**
 * Where a task lands after dragging `delta` days. Moving keeps a due-only
 * task due-only; resizing always writes both ends so the bar keeps its
 * new shape. Edges never cross.
 */
export function reschedule(item: Pick<TimelineItem, "start" | "end" | "hasStart" | "hasDue">, mode: DragMode, delta: number): Rescheduled | null {
  if (delta === 0) return null
  if (mode === "move") {
    const start = addDays(item.start, delta)
    const end = addDays(item.end, delta)
    const patch: Rescheduled["patch"] = {}
    if (item.hasStart) patch.start = start
    if (item.hasDue || !item.hasStart) patch.due = end
    return { start, end, patch }
  }
  if (mode === "start") {
    const moved = addDays(item.start, delta)
    const start = moved > item.end ? item.end : moved
    if (start === item.start) return null
    return { start, end: item.end, patch: { start, due: item.end } }
  }
  const moved = addDays(item.end, delta)
  const end = moved < item.start ? item.start : moved
  if (end === item.end) return null
  return { start: item.start, end, patch: { start: item.start, due: end } }
}

/**
 * Greedy lane packing: each item gets the first lane whose last item ended
 * before it starts. Input order doesn't matter; ties keep the longer bar
 * higher.
 */
export function packLanes<T extends { start: Day; end: Day }>(items: T[]): { item: T; lane: number }[] {
  const sorted = [...items].sort((a, b) => (a.start === b.start ? diffDays(b.start, b.end) - diffDays(a.start, a.end) : a.start < b.start ? -1 : 1))
  const laneEnds: Day[] = []
  return sorted.map((item) => {
    let lane = laneEnds.findIndex((e) => e < item.start)
    if (lane < 0) {
      lane = laneEnds.length
      laneEnds.push(item.end)
    } else laneEnds[lane] = item.end
    return { item, lane }
  })
}

/** Monday-first weeks covering the month that `anyDay` falls in. */
export function monthWeeks(anyDay: Day): Day[][] {
  const first = startOfMonth(anyDay)
  const last = addDays(addMonths(first, 1), -1)
  const weeks: Day[][] = []
  for (let w = startOfWeek(first); w <= last; w = addDays(w, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)))
  }
  return weeks
}

export function dayList(from: Day, to: Day): Day[] {
  const n = diffDays(from, to)
  return Array.from({ length: Math.max(0, n + 1) }, (_, i) => addDays(from, i))
}

export function isWeekend(d: Day): boolean {
  const dow = new Date(`${d}T00:00:00Z`).getUTCDay()
  return dow === 0 || dow === 6
}

/** "26 Sep", or "26 Sep 2027" outside the current year. */
export function shortDay(d: Day, thisYear = new Date().getFullYear()): string {
  const date = new Date(`${d}T00:00:00Z`)
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    ...(date.getUTCFullYear() !== thisYear ? { year: "numeric" } : {}),
  })
}

export function dayRange(start: Day, end: Day): string {
  return start === end ? shortDay(start) : `${shortDay(start)} to ${shortDay(end)}`
}
