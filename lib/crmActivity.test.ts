import { describe, it, expect } from "vitest"
import { activityState, agentLabel, dueState, formatWhen, isCompletable, localInputToIso, sortFollowUps } from "./crmActivity"

// Built from local components so the assertions hold in any timezone.
const NOW = new Date(2026, 8, 29, 12, 0, 0)
const at = (m: number, d: number, h = 12, min = 0) => new Date(2026, m, d, h, min).toISOString()

describe("dueState", () => {
  it("classifies relative to now", () => {
    expect(dueState(null, NOW)).toBe("none")
    expect(dueState("garbage", NOW)).toBe("none")
    expect(dueState(at(8, 29, 9), NOW)).toBe("overdue")
    expect(dueState(at(8, 28), NOW)).toBe("overdue")
    expect(dueState(at(8, 29, 17), NOW)).toBe("today")
    expect(dueState(at(8, 30, 9), NOW)).toBe("upcoming")
    expect(dueState(at(10, 1), NOW)).toBe("upcoming")
  })
})

describe("sortFollowUps", () => {
  it("drops rows without a due date and orders most overdue first", () => {
    const rows = [
      { id: "later", due_at: at(9, 5) },
      { id: "none", due_at: null },
      { id: "overdue", due_at: at(8, 20) },
      { id: "soon", due_at: at(8, 30) },
    ]
    expect(sortFollowUps(rows).map((r) => r.id)).toEqual(["overdue", "soon", "later"])
  })

  it("does not mutate its input", () => {
    const rows = [{ due_at: at(9, 5) }, { due_at: at(8, 20) }]
    const copy = [...rows]
    sortFollowUps(rows)
    expect(rows).toEqual(copy)
  })
})

describe("localInputToIso", () => {
  it("round-trips a datetime-local value and rejects empty or invalid input", () => {
    const iso = localInputToIso("2026-10-03T10:30")
    expect(iso).not.toBeNull()
    const d = new Date(iso as string)
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 3, 10, 30])
    expect(localInputToIso("")).toBeNull()
    expect(localInputToIso("   ")).toBeNull()
    expect(localInputToIso("not a date")).toBeNull()
  })
})

describe("agentLabel", () => {
  it("names a known agent and falls back to the raw type", () => {
    expect(agentLabel("leads_qualifier")).toBe("Lex (agent)")
    expect(agentLabel("some_new_agent")).toBe("some_new_agent (agent)")
  })
})

describe("formatWhen", () => {
  it("omits the year for the current year and shows it otherwise", () => {
    expect(formatWhen(at(9, 3, 10, 30), NOW)).not.toMatch(/2026/)
    expect(formatWhen(new Date(2027, 0, 5, 9, 0).toISOString(), NOW)).toMatch(/2027/)
    expect(formatWhen("bad", NOW)).toBe("")
  })
})

describe("activityState / isCompletable", () => {
  it("a completed activity is done even when its due date passed", () => {
    expect(activityState({ due_at: at(8, 20), completed_at: at(8, 21) }, NOW)).toBe("done")
    expect(activityState({ due_at: at(8, 20), completed_at: null }, NOW)).toBe("overdue")
    expect(activityState({ due_at: null, completed_at: null }, NOW)).toBe("none")
    expect(activityState({ due_at: at(9, 5), completed_at: null }, NOW)).toBe("upcoming")
  })

  it("follow-ups and tasks can be ticked off, plain notes cannot", () => {
    expect(isCompletable({ due_at: at(9, 5), kind: "call" })).toBe(true)
    expect(isCompletable({ due_at: null, kind: "task" })).toBe(true)
    expect(isCompletable({ due_at: null, kind: "note" })).toBe(false)
    expect(isCompletable({ due_at: null, kind: "email" })).toBe(false)
  })
})
