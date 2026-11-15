import { describe, expect, it } from "vitest"
import {
  DEFAULT_STATUSES,
  computeRollups,
  defaultStatus,
  deleteStatusRefs,
  entersClosed,
  entersDone,
  entersInProgress,
  firstStatusOf,
  isBlocked,
  isClosedStatus,
  matchesDueFilter,
  openBlockers,
  parseStatusDefs,
  renameStatusRefs,
  resolveStatus,
  statusDefsProblem,
  statusGroup,
  subtaskProgress,
  unblockedBy,
  type FieldDef,
  type StatusDef,
} from "./workspaceDbModel"

const ROOM: StatusDef[] = [
  { name: "Backlog", group: "todo" },
  { name: "Ready", group: "todo" },
  { name: "Building", group: "in_progress" },
  { name: "Review", group: "in_progress" },
  { name: "Shipped", group: "done" },
  { name: "Won't do", group: "canceled" },
]

describe("status definitions", () => {
  it("defaults to Todo / Doing / Done when nothing (or something broken) is configured", () => {
    expect(parseStatusDefs(undefined)).toEqual(DEFAULT_STATUSES)
    expect(parseStatusDefs([{ name: "Only", group: "in_progress" }])).toEqual(DEFAULT_STATUSES)
  })

  it("orders by group and keeps the configured order inside a group", () => {
    const defs = parseStatusDefs([
      { name: "Shipped", group: "done" },
      { name: " Ready  now ", group: "todo" },
      { name: "Building", group: "in_progress" },
      { name: "Backlog", group: "todo" },
    ])
    expect(defs.map((d) => d.name)).toEqual(["Ready now", "Backlog", "Building", "Shipped"])
  })

  it("explains what's wrong with a list", () => {
    expect(statusDefsProblem(ROOM)).toBeNull()
    expect(statusDefsProblem("x")).toBe("shape")
    expect(statusDefsProblem([{ name: "", group: "todo" }])).toBe("empty_name")
    expect(statusDefsProblem([{ name: "A", group: "todo" }, { name: "a", group: "done" }])).toBe("duplicate")
    expect(statusDefsProblem([{ name: "A", group: "later" }])).toBe("bad_group")
    expect(statusDefsProblem([{ name: "A", group: "done" }])).toBe("no_todo")
    expect(statusDefsProblem([{ name: "A", group: "todo" }])).toBe("no_done")
    const many = Array.from({ length: 13 }, (_, i) => ({ name: `S${i}`, group: i === 0 ? "done" : "todo" }))
    expect(statusDefsProblem(many)).toBe("too_many")
  })

  it("maps names to groups, unknown names by their legacy meaning", () => {
    expect(statusGroup(ROOM, "Review")).toBe("in_progress")
    expect(statusGroup(ROOM, "Won't do")).toBe("canceled")
    expect(statusGroup(ROOM, "Done")).toBe("done")
    expect(statusGroup(ROOM, "Doing")).toBe("in_progress")
    expect(statusGroup(ROOM, "Whatever")).toBe("todo")
    expect(isClosedStatus(ROOM, "Shipped")).toBe(true)
    expect(isClosedStatus(ROOM, "Won't do")).toBe(true)
    expect(isClosedStatus(ROOM, "Review")).toBe(false)
  })

  it("resolves what writers send: exact, any case, or a legacy name", () => {
    expect(resolveStatus(ROOM, "Review")).toBe("Review")
    expect(resolveStatus(ROOM, "review")).toBe("Review")
    expect(resolveStatus(ROOM, "Todo")).toBe("Backlog")
    expect(resolveStatus(ROOM, "Doing")).toBe("Building")
    expect(resolveStatus(ROOM, "Done")).toBe("Shipped")
    expect(resolveStatus(ROOM, "Archived")).toBeNull()
    expect(resolveStatus(ROOM, 3)).toBeNull()
    expect(resolveStatus(DEFAULT_STATUSES, "Done")).toBe("Done")
  })

  it("knows the first status of a group and where new tasks start", () => {
    expect(firstStatusOf(ROOM, "done")).toBe("Shipped")
    expect(firstStatusOf(DEFAULT_STATUSES, "canceled")).toBeNull()
    expect(defaultStatus(ROOM)).toBe("Backlog")
    expect(defaultStatus(DEFAULT_STATUSES)).toBe("Todo")
  })

  it("detects entering a group", () => {
    expect(entersDone(ROOM, "Review", "Shipped")).toBe(true)
    expect(entersDone(ROOM, "Shipped", "Done")).toBe(false)
    expect(entersDone(ROOM, "Review", "Won't do")).toBe(false)
    expect(entersClosed(ROOM, "Review", "Won't do")).toBe(true)
    expect(entersClosed(ROOM, "Shipped", "Won't do")).toBe(false)
    expect(entersInProgress(ROOM, "Backlog", "Review")).toBe(true)
    expect(entersInProgress(ROOM, "Building", "Review")).toBe(false)
  })
})

describe("logic keyed off groups", () => {
  it("overdue ignores closed tasks of any name", () => {
    expect(matchesDueFilter("2026-11-01", "Review", "Overdue", "2026-11-16", ROOM)).toBe(true)
    expect(matchesDueFilter("2026-11-01", "Shipped", "Overdue", "2026-11-16", ROOM)).toBe(false)
    expect(matchesDueFilter("2026-11-01", "Won't do", "Overdue", "2026-11-16", ROOM)).toBe(false)
    // Default statuses still behave as before.
    expect(matchesDueFilter("2026-11-01", "Done", "Overdue", "2026-11-16")).toBe(false)
  })

  it("sub-task progress counts the done group and leaves canceled out", () => {
    const rows = [
      { id: "p", parentId: null, status: "Building" },
      { id: "a", parentId: "p", status: "Shipped" },
      { id: "b", parentId: "p", status: "Review" },
      { id: "c", parentId: "p", status: "Won't do" },
    ]
    expect(subtaskProgress(rows, "p", ROOM)).toEqual({ done: 1, total: 2 })
  })

  it("closed blockers (done or canceled) no longer block, and free the waiting task", () => {
    const rows = [
      { id: "a", blockedBy: [] as string[], status: "Shipped" },
      { id: "b", blockedBy: [] as string[], status: "Won't do" },
      { id: "c", blockedBy: [] as string[], status: "Review" },
      { id: "t", blockedBy: ["a", "b"], status: "Backlog" },
      { id: "u", blockedBy: ["b", "c"], status: "Backlog" },
    ]
    expect(openBlockers(rows, rows[3], ROOM)).toEqual([])
    expect(isBlocked(rows, rows[4], ROOM)).toBe(true)
    expect(unblockedBy(rows, "b", ROOM).map((r) => r.id)).toEqual(["t"])
    expect(unblockedBy(rows, "c", ROOM)).toEqual([])
  })

  it("donePct rollup uses the TARGET room's groups and skips canceled rows", () => {
    const defs: FieldDef[] = [
      { id: "rel", name: "Tasks", type: "relation", options: [], targetDocId: "other" },
      { id: "pct", name: "Done %", type: "rollup", options: [], relationFieldId: "rel", rollupOp: "donePct" },
    ]
    const target = [
      { id: "x", status: "Shipped", cells: {} },
      { id: "y", status: "Review", cells: {} },
      { id: "z", status: "Won't do", cells: {} },
    ]
    const out = computeRollups(
      [{ id: "r", status: "Todo", cells: { rel: ["x", "y", "z"] } }],
      defs,
      () => target,
      () => ROOM,
    )
    expect(out.r.pct).toBe(50)
  })
})

describe("rename / delete follow-ups", () => {
  const props = {
    dbWip: { Review: 3, Building: 5 },
    dbAutomations: [
      { id: "1", name: "Ping", whenStatus: "Review", addComment: "please review" },
      { id: "2", name: "Auto", whenStatus: "Building", moveTo: "Review" },
      { id: "3", name: "Only move", whenStatus: "Backlog", moveTo: "Review" },
    ],
    dbViews: [{ id: "v", name: "In review", statusFilter: "Review" }, { id: "w", name: "All", statusFilter: "All" }],
    dbTemplates: [{ id: "t", name: "Bug", status: "Review" }],
  }

  it("renames every reference and returns only what changed", () => {
    const out = renameStatusRefs(props, "Review", "QA")
    expect(out.dbWip).toEqual({ QA: 3, Building: 5 })
    expect(out.dbAutomations?.map((r) => [r.whenStatus, r.moveTo])).toEqual([
      ["QA", undefined],
      ["Building", "QA"],
      ["Backlog", "QA"],
    ])
    expect(out.dbViews?.[0].statusFilter).toBe("QA")
    expect(out.dbTemplates?.[0].status).toBe("QA")
    expect(renameStatusRefs(props, "Nope", "X")).toEqual({})
  })

  it("deleting drops its limit and triggers, strips moves into it, resets views", () => {
    const out = deleteStatusRefs(props, "Review", "Building")
    expect(out.dbWip).toEqual({ Building: 5 })
    // Rule 1 is triggered by it (gone), rule 2 loses its move (and has nothing left), rule 3 too.
    expect(out.dbAutomations).toEqual([])
    expect(out.dbViews?.[0].statusFilter).toBe("All")
    expect(out.dbTemplates?.[0].status).toBe("Building")
  })
})
