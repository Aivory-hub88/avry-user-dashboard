"use client"

/**
 * Month view (ADR-019 P6): a Monday-first grid. Multi-day tasks and pending
 * requests run as bars across each week they touch (lane-packed); notes,
 * agent jobs and deadlines are single-day chips. Up to MAX_LANES rows per
 * week, then "+n more" on the busy days. Rescheduling happens in the
 * Timeline view; here a click opens the item.
 */
import { useMemo } from "react"
import { Diamond } from "lucide-react"
import { addDays, diffDays, isWeekend, monthWeeks, packLanes, type Day, type TimelineItem } from "@/lib/timeline"
import { forLabel, itemTone } from "@/components/timeline/timelineUi"

const MAX_LANES = 4
const LANE_H = 22

export default function MonthView({
  month,
  items,
  today,
  selfId,
  roomTitles,
  onOpen,
}: {
  /** Any day inside the month to show. */
  month: Day
  items: TimelineItem[]
  today: Day
  selfId: string | null
  roomTitles: Map<string, string>
  onOpen: (item: TimelineItem, at: { x: number; y: number }) => void
}) {
  const weeks = useMemo(() => monthWeeks(month), [month])
  const monthKey = month.slice(0, 7)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
      <div className="sticky top-0 z-10 grid grid-cols-7 bg-surface-1 pt-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-2 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-white/30">
            {d}
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-line">
        {weeks.map((week) => {
          const wStart = week[0]
          const wEnd = week[6]
          const inWeek = items.filter((i) => i.start <= wEnd && i.end >= wStart)
          const segs = inWeek.map((i) => ({
            ...i,
            segStart: i.start < wStart ? wStart : i.start,
            segEnd: i.end > wEnd ? wEnd : i.end,
          }))
          const packed = packLanes(segs.map((s) => ({ ...s, start: s.segStart, end: s.segEnd })))
          const hiddenPerDay = new Map<Day, number>()
          for (const p of packed) {
            if (p.lane < MAX_LANES) continue
            for (let d = p.item.start; d <= p.item.end; d = addDays(d, 1)) hiddenPerDay.set(d, (hiddenPerDay.get(d) ?? 0) + 1)
          }
          const lanes = Math.min(MAX_LANES, packed.reduce((m, p) => Math.max(m, p.lane + 1), 0))
          return (
            <div key={wStart} className="relative border-b border-line last:border-b-0" style={{ minHeight: 34 + Math.max(lanes, 2) * (LANE_H + 3) + 18 }}>
              <div className="absolute inset-0 grid grid-cols-7" aria-hidden>
                {week.map((d) => (
                  <div
                    key={d}
                    className={`border-r border-line last:border-r-0 ${d.slice(0, 7) !== monthKey ? "bg-black/20" : isWeekend(d) ? "bg-white/[0.015]" : ""}`}
                  />
                ))}
              </div>
              <div className="relative grid grid-cols-7">
                {week.map((d) => (
                  <div key={d} className="flex h-8 items-center px-2">
                    <span
                      className={`text-[12px] tabular-nums ${
                        d === today
                          ? "rounded-full bg-sky-400/25 px-1.5 font-semibold text-sky-100"
                          : d.slice(0, 7) !== monthKey
                            ? "text-white/20"
                            : "text-white/55"
                      }`}
                    >
                      {Number(d.slice(8))}
                    </span>
                  </div>
                ))}
              </div>
              <div className="relative" style={{ height: lanes * (LANE_H + 3) }}>
                {packed
                  .filter((p) => p.lane < MAX_LANES)
                  .map(({ item, lane }) => {
                    const a = diffDays(wStart, item.start)
                    const len = diffDays(item.start, item.end) + 1
                    const who = forLabel(item, selfId)
                    const room = item.roomId ? roomTitles.get(item.roomId) : ""
                    return (
                      <button
                        key={`${item.id}:${wStart}`}
                        type="button"
                        onClick={(e) => onOpen(item, { x: e.clientX, y: e.clientY })}
                        title={[item.title, room, who].filter(Boolean).join(" · ")}
                        className={`absolute flex items-center gap-1 overflow-hidden rounded-md px-1.5 text-left text-[11px] transition-transform duration-150 ease-out active:scale-[0.98] ${itemTone(item)}`}
                        style={{
                          top: lane * (LANE_H + 3),
                          height: LANE_H,
                          left: `calc(${(a / 7) * 100}% + 3px)`,
                          width: `calc(${(len / 7) * 100}% - 6px)`,
                        }}
                      >
                        {item.kind === "deadline" && <Diamond className="h-2.5 w-2.5 shrink-0 fill-amber-300/80 text-amber-300" />}
                        <span className="truncate">{item.kind === "deadline" && room ? `${room} deadline` : item.title}</span>
                      </button>
                    )
                  })}
              </div>
              {hiddenPerDay.size > 0 && (
                <div className="relative grid grid-cols-7">
                  {week.map((d) => (
                    <div key={d} className="px-2 pb-1 text-[10.5px] text-white/35">
                      {hiddenPerDay.get(d) ? `+${hiddenPerDay.get(d)} more` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
