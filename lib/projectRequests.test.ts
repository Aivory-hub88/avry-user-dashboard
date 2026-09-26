import { describe, it, expect } from "vitest"
import { cleanRequestInput, cleanDataTable, reviewTransition, submitProblems, requestFromRow, LIMITS } from "@/lib/projectRequests"
import { seedFields, seedRows } from "@/lib/projectRequestStore"

describe("cleanRequestInput", () => {
  it("returns only the keys that were sent", () => {
    expect(cleanRequestInput({ goal: "  Ship it  " })).toEqual({ ok: true, value: { goal: "Ship it" } })
  })

  it("normalises members: lowercase, dedupe, default role editor", () => {
    const v = cleanRequestInput({ members: [{ email: "Rina@X.id" }, { email: "rina@x.id", role: "viewer" }, { email: "a@b.co", role: "viewer" }] })
    expect(v).toEqual({ ok: true, value: { members: [{ email: "rina@x.id", role: "editor" }, { email: "a@b.co", role: "viewer" }] } })
  })

  it.each([
    [{ title: "   " }, "title required"],
    [{ deadline: "30/11/2026" }, "deadline must be YYYY-MM-DD"],
    [{ priority: "Urgent" }, "priority must be Low, Med or High"],
    [{ members: [{ email: "not-an-email" }] }, "not an email address: not-an-email"],
    [{ agents: ["made_up_agent"] }, "unknown agent: made_up_agent"],
    [{ fields: Array.from({ length: LIMITS.fields + 1 }, () => ({ label: "a", value: "b" })) }, `at most ${LIMITS.fields} fields`],
  ])("rejects %j", (input, error) => {
    expect(cleanRequestInput(input)).toEqual({ ok: false, error })
  })

  it("clears the deadline with null or empty string", () => {
    expect(cleanRequestInput({ deadline: "" })).toEqual({ ok: true, value: { deadline: null } })
  })

  it("drops fields without a label", () => {
    expect(cleanRequestInput({ fields: [{ label: "", value: "x" }, { label: "Budget", value: "50m" }] }))
      .toEqual({ ok: true, value: { fields: [{ label: "Budget", value: "50m" }] } })
  })
})

describe("cleanDataTable", () => {
  it("pads short rows, drops blank rows, trims cells", () => {
    expect(cleanDataTable({ columns: ["Name", "City"], rows: [["Acme"], ["", ""], [" Beta ", "Bali", "extra"]] }))
      .toEqual({ ok: true, value: { columns: ["Name", "City"], rows: [["Acme", ""], ["Beta", "Bali"]] } })
  })

  it("needs a name for every column", () => {
    expect(cleanDataTable({ columns: ["Name", " "], rows: [] })).toEqual({ ok: false, error: "every column needs a name" })
  })

  it("caps rows", () => {
    const rows = Array.from({ length: LIMITS.rows + 1 }, () => ["x"])
    expect(cleanDataTable({ columns: ["A"], rows }).ok).toBe(false)
  })
})

describe("transitions", () => {
  it("reviews only submitted requests", () => {
    expect(reviewTransition("submitted", "approve")).toBe("approved")
    expect(reviewTransition("submitted", "changes")).toBe("changes_requested")
    expect(reviewTransition("submitted", "reject")).toBe("rejected")
    expect(reviewTransition("draft", "approve")).toBeNull()
    expect(reviewTransition("approved", "reject")).toBeNull()
  })

  it("needs a title and a goal to submit", () => {
    expect(submitProblems({ title: "X", goal: "" })).toEqual(["Describe the goal"])
    expect(submitProblems({ title: "X", goal: "Y" })).toEqual([])
  })
})

describe("room seeding", () => {
  it("first column becomes the row title, the rest text fields", () => {
    const fields = seedFields(["Customer", "City", "A very long column name indeed"])
    expect(fields).toEqual([
      { id: "rq1", name: "City", type: "text", options: [] },
      { id: "rq2", name: "A very long column name", type: "text", options: [] },
    ])
    const rows = seedRows({ columns: ["Customer", "City", "X"], rows: [["Acme", "Jakarta", ""]] }, fields)
    expect(rows[0]).toMatchObject({ title: "Acme", status: "Todo", cells: { rq1: "Jakarta" } })
  })
})

describe("requestFromRow", () => {
  it("formats a pg DATE as YYYY-MM-DD and defaults bad values", () => {
    const r = requestFromRow({ id: "r1", deadline: new Date("2026-11-30T00:00:00Z"), priority: "??", data_table: null })
    expect(r.deadline).toBe("2026-11-30")
    expect(r.priority).toBe("Med")
    expect(r.dataTable).toEqual({ columns: [], rows: [] })
  })
})
