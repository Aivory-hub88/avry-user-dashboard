import { describe, expect, it } from "vitest"
import {
  addDays,
  addMonths,
  cleanWindow,
  diffDays,
  isDay,
  monthWeeks,
  packLanes,
  reschedule,
  startOfWeek,
  taskItem,
  toDay,
} from "@/lib/timeline"

describe("day maths", () => {
  it("validates real calendar days only", () => {
    expect(isDay("2026-09-26")).toBe(true)
    expect(isDay("2026-02-30")).toBe(false)
    expect(isDay("26/09/2026")).toBe(false)
    expect(toDay("2026-09-26T10:00:00Z")).toBe("2026-09-26")
    expect(toDay("")).toBeNull()
  })

  it("adds and diffs across month and DST boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01")
    expect(addDays("2026-03-29", -1)).toBe("2026-03-28")
    expect(diffDays("2026-09-26", "2026-10-26")).toBe(30)
  })

  it("weeks start on Monday", () => {
    expect(startOfWeek("2026-09-26")).toBe("2026-09-21") // Saturday → Monday
    expect(startOfWeek("2026-09-21")).toBe("2026-09-21")
    expect(startOfWeek("2026-09-27")).toBe("2026-09-21") // Sunday
  })

  it("moves months across years", () => {
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-01")
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01")
  })

  it("month grid covers the whole month in full weeks", () => {
    const weeks = monthWeeks("2026-09-10")
    expect(weeks[0][0]).toBe("2026-08-31")
    expect(weeks.at(-1)!.at(-1)! >= "2026-09-30").toBe(true)
    expect(weeks.every((w) => w.length === 7)).toBe(true)
  })

  it("caps and repairs the requested window", () => {
    expect(cleanWindow("2026-09-01", "2027-09-01", "2026-09-26")).toEqual({ from: "2026-09-01", to: "2026-12-30" })
    expect(cleanWindow("2026-09-10", "2026-09-01", "2026-09-26")).toEqual({ from: "2026-09-10", to: "2026-09-10" })
    expect(cleanWindow(undefined, undefined, "2026-09-26")).toEqual({ from: "2026-09-14", to: "2026-10-25" })
  })
})

describe("taskItem", () => {
  it("skips undated tasks and fills a missing end", () => {
    expect(taskItem({ id: "r1", title: "A" }, "room", true)).toBeNull()
    expect(taskItem({ id: "r1", title: "A", due: "2026-09-30" }, "room", true)).toMatchObject({
      start: "2026-09-30",
      end: "2026-09-30",
      hasStart: false,
      hasDue: true,
    })
  })

  it("swaps reversed dates", () => {
    expect(taskItem({ id: "r1", title: "", start: "2026-10-05", due: "2026-10-01" }, "room", false)).toMatchObject({
      start: "2026-10-01",
      end: "2026-10-05",
      title: "Untitled",
    })
  })
})

describe("reschedule", () => {
  const both = { start: "2026-09-10", end: "2026-09-14", hasStart: true, hasDue: true }
  const dueOnly = { start: "2026-09-10", end: "2026-09-10", hasStart: false, hasDue: true }

  it("moves both ends", () => {
    expect(reschedule(both, "move", 3)).toEqual({ start: "2026-09-13", end: "2026-09-17", patch: { start: "2026-09-13", due: "2026-09-17" } })
  })

  it("keeps a due-only task due-only when moved", () => {
    expect(reschedule(dueOnly, "move", -2)?.patch).toEqual({ due: "2026-09-08" })
  })

  it("resizing writes both ends and never crosses", () => {
    expect(reschedule(dueOnly, "start", -3)?.patch).toEqual({ start: "2026-09-07", due: "2026-09-10" })
    expect(reschedule(both, "end", -10)).toEqual({ start: "2026-09-10", end: "2026-09-10", patch: { start: "2026-09-10", due: "2026-09-10" } })
    expect(reschedule(both, "start", 0)).toBeNull()
    expect(reschedule(dueOnly, "end", -1)).toBeNull()
  })
})

describe("packLanes", () => {
  it("stacks overlapping bars and reuses free lanes", () => {
    const a = { id: "a", start: "2026-09-01", end: "2026-09-05" }
    const b = { id: "b", start: "2026-09-03", end: "2026-09-04" }
    const c = { id: "c", start: "2026-09-06", end: "2026-09-07" }
    const lanes = Object.fromEntries(packLanes([c, b, a]).map((x) => [x.item.id, x.lane]))
    expect(lanes).toEqual({ a: 0, b: 1, c: 0 })
  })
})
