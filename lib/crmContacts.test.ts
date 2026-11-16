import { describe, expect, it } from "vitest"
import type { Activity } from "./crmClient"
import { contactedLabel, contactNextStep, daysSince, findDuplicate, lastContactMap, matchesView, parseSavedViews } from "./crmContacts"
import { buildImportPlan } from "./crmOnboarding"

const NOW = new Date(2026, 10, 16, 12, 0, 0)
const act = (o: Record<string, unknown>) => ({ kind: "call", subject_type: "contact", subject_id: "c1", occurred_at: "2026-11-10T09:00:00", due_at: null, completed_at: null, ...o }) as unknown as Activity

describe("last contact + next step", () => {
  it("takes the latest call/email/meeting, ignoring notes, tasks, other subjects and the future", () => {
    const m = lastContactMap(
      [
        act({ occurred_at: "2026-11-01T09:00:00" }),
        act({ kind: "email", occurred_at: "2026-11-12T09:00:00" }),
        act({ kind: "note", occurred_at: "2026-11-15T09:00:00" }),
        act({ kind: "meeting", occurred_at: "2027-01-01T09:00:00" }),
        act({ subject_type: "deal", occurred_at: "2026-11-14T09:00:00" }),
      ],
      NOW,
    )
    expect(m.get("c1")).toBe("2026-11-12T09:00:00")
    expect(m.size).toBe(1)
  })
  it("picks the soonest open follow-up", () => {
    const n = contactNextStep([act({ due_at: "2026-11-20T09:00:00" }), act({ due_at: "2026-11-18T09:00:00" }), act({ due_at: "2026-11-17T09:00:00", completed_at: "2026-11-16T00:00:00" })])
    expect(n.get("c1")?.due_at).toBe("2026-11-18T09:00:00")
  })
  it("counts local days and words them", () => {
    expect(daysSince("2026-11-16T01:00:00", NOW)).toBe(0)
    expect(daysSince("2026-11-09T23:00:00", NOW)).toBe(7)
    expect(daysSince(null, NOW)).toBeNull()
    expect([null, 0, 1, 5, 45, 400].map(contactedLabel)).toEqual(["Never", "Today", "Yesterday", "5 d ago", "1 mo ago", "1 y ago"])
  })
})

describe("smart views", () => {
  it("stale = never or 7+ days", () => {
    expect(matchesView("stale", { lastContactDays: null, nextDueState: "none" })).toBe(true)
    expect(matchesView("stale", { lastContactDays: 6, nextDueState: "none" })).toBe(false)
    expect(matchesView("stale", { lastContactDays: 7, nextDueState: "none" })).toBe(true)
  })
  it("overdue and no-next-step", () => {
    expect(matchesView("overdue", { lastContactDays: 1, nextDueState: "overdue" })).toBe(true)
    expect(matchesView("nostep", { lastContactDays: 1, nextDueState: "upcoming" })).toBe(false)
    expect(matchesView("nostep", { lastContactDays: 1, nextDueState: "none" })).toBe(true)
  })
  it("reads saved views defensively", () => {
    expect(parseSavedViews("nope")).toEqual([])
    expect(parseSavedViews(JSON.stringify([{ id: "1", name: "Hot", view: "stale", label: "Hot" }, { id: "2", name: "", view: "all", label: null }, { id: "3", name: "x", view: "bogus", label: null }]))).toHaveLength(1)
  })
})

describe("duplicates", () => {
  const people = [{ email: "Maya@X.example", phone: "0812-3456-7890" }, { email: null, phone: null }]
  it("matches email case-insensitively and phone across formats", () => {
    expect(findDuplicate(people, { email: "maya@x.example" })?.by).toBe("email")
    expect(findDuplicate(people, { phone: "+62 812 3456 7890" })?.by).toBe("phone")
  })
  it("never matches blanks", () => {
    expect(findDuplicate(people, { email: "", phone: "" })).toBeNull()
    expect(findDuplicate(people, { email: "other@x.example", phone: "0899 111 2222" })).toBeNull()
  })
  it("import leaves out rows already in the CRM or repeated in the file", () => {
    const rows = [["Maya", "maya@x.example", ""], ["New One", "new@x.example", "0811 000 111"], ["New Again", "NEW@x.example", ""], ["Phone Twin", "", "+62 811 000 111"], ["Fresh", "fresh@x.example", ""]]
    const plan = buildImportPlan(rows, ["name", "email", "phone"], [], people)
    expect(plan.contacts.map((c) => c.name)).toEqual(["New One", "Fresh"])
    expect(plan.duplicates).toBe(3)
  })
})
