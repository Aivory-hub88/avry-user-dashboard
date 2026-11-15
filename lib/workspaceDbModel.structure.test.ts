import { describe, expect, it } from "vitest"
import {
  blockedByCycle,
  blockedByProblem,
  blocking,
  cleanBlockedBy,
  cleanParentId,
  descendantIds,
  isBlocked,
  openBlockers,
  parentProblem,
  subtaskProgress,
  unblockedBy,
  MAX_BLOCKED_BY,
} from "./workspaceDbModel"

type R = { id: string; parentId: string | null; blockedBy: string[]; status: string }
const r = (id: string, over: Partial<R> = {}): R => ({ id, parentId: null, blockedBy: [], status: "Todo", ...over })

describe("cleanParentId / cleanBlockedBy", () => {
  it("reads legacy rows as no parent, no blockers", () => {
    expect(cleanParentId(undefined)).toBeNull()
    expect(cleanParentId("")).toBeNull()
    expect(cleanParentId("  p1 ")).toBe("p1")
    expect(cleanParentId(42)).toBeNull()
    expect(cleanBlockedBy(undefined)).toEqual([])
    expect(cleanBlockedBy("a")).toEqual([])
  })

  it("dedupes, drops self and junk, caps the list", () => {
    expect(cleanBlockedBy(["a", "a", " b ", 3, "", "me"], "me")).toEqual(["a", "b"])
    const many = Array.from({ length: 30 }, (_, i) => `r${i}`)
    expect(cleanBlockedBy(many)).toHaveLength(MAX_BLOCKED_BY)
  })
})

describe("parentProblem", () => {
  const rows = [r("p"), r("c", { parentId: "p" }), r("solo"), r("orphan", { parentId: "gone" })]

  it("accepts a top-level parent and null", () => {
    expect(parentProblem(rows, "solo", "p")).toBeNull()
    expect(parentProblem(rows, "c", null)).toBeNull()
    // A parent whose own parent no longer exists counts as top level.
    expect(parentProblem(rows, "solo", "orphan")).toBeNull()
  })

  it("rejects self, missing, descendants, sub-tasks and rows with sub-tasks", () => {
    expect(parentProblem(rows, "solo", "solo")).toBe("self")
    expect(parentProblem(rows, "solo", "nope")).toBe("missing")
    expect(parentProblem(rows, "p", "c")).toBe("cycle")
    expect(parentProblem(rows, "solo", "c")).toBe("nested")
    expect(parentProblem([...rows, r("x")], "p", "x")).toBe("has_subtasks")
  })

  it("descendantIds walks every level", () => {
    const deep = [r("a"), r("b", { parentId: "a" }), r("c", { parentId: "b" }), r("d")]
    expect(descendantIds(deep, "a").sort()).toEqual(["b", "c"])
    expect(descendantIds(deep, "d")).toEqual([])
  })
})

describe("blockedBy validation", () => {
  // b waits on a, c waits on b.
  const rows = [r("a"), r("b", { blockedBy: ["a"] }), r("c", { blockedBy: ["b"] })]

  it("finds direct and transitive cycles", () => {
    expect(blockedByCycle(rows, "a", ["b"])).toBe(true)
    expect(blockedByCycle(rows, "a", ["c"])).toBe(true)
    expect(blockedByCycle(rows, "c", ["a"])).toBe(false)
  })

  it("names the problem", () => {
    expect(blockedByProblem(rows, "a", ["a"])).toBe("self")
    expect(blockedByProblem(rows, "a", ["zzz"])).toBe("missing")
    expect(blockedByProblem(rows, "a", ["c"])).toBe("cycle")
    expect(blockedByProblem(rows, "c", ["a", "b"])).toBeNull()
    const many = Array.from({ length: MAX_BLOCKED_BY + 1 }, (_, i) => `r${i}`)
    expect(blockedByProblem(rows, "a", many)).toBe("too_many")
  })

  it("ignores the row's own current edges (they are being replaced)", () => {
    const loop = [r("a", { blockedBy: ["b"] }), r("b")]
    expect(blockedByProblem(loop, "a", ["b"])).toBeNull()
    expect(blockedByProblem(loop, "b", ["a"])).toBe("cycle")
  })
})

describe("progress and blocked state", () => {
  it("counts sub-tasks done / total", () => {
    const rows = [r("p"), r("c1", { parentId: "p", status: "Done" }), r("c2", { parentId: "p" }), r("x")]
    expect(subtaskProgress(rows, "p")).toEqual({ done: 1, total: 2 })
    expect(subtaskProgress(rows, "x")).toEqual({ done: 0, total: 0 })
  })

  it("is blocked while any existing blocker isn't Done", () => {
    const rows = [r("a", { status: "Done" }), r("b"), r("t", { blockedBy: ["a", "b", "gone"] })]
    const t = rows[2]
    expect(openBlockers(rows, t).map((x) => x.id)).toEqual(["b"])
    expect(isBlocked(rows, t)).toBe(true)
    expect(isBlocked([r("a", { status: "Done" }), r("t", { blockedBy: ["a", "gone"] })], t)).toBe(false)
    expect(blocking(rows, "b").map((x) => x.id)).toEqual(["t"])
  })

  it("unblockedBy: only tasks whose last open blocker just finished", () => {
    const rows = [
      r("a", { status: "Done" }),
      r("b"),
      r("only-a", { blockedBy: ["a"] }),
      r("a-and-b", { blockedBy: ["a", "b"] }),
      r("already-done", { blockedBy: ["a"], status: "Done" }),
      r("unrelated"),
    ]
    expect(unblockedBy(rows, "a").map((x) => x.id)).toEqual(["only-a"])
    // A blocker that isn't Done unblocks nothing.
    expect(unblockedBy(rows, "b")).toEqual([])
  })
})
