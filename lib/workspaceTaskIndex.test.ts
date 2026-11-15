import { describe, expect, it, vi, beforeEach } from "vitest"

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))
vi.mock("@/lib/db", () => ({ query: queryMock }))

import { bareDocId, restampTaskIndexGroups, syncTaskIndex, taskIndexRecords, tasksInvolving } from "./workspaceTaskIndex"
import type { DbRow } from "./workspaceDb"

const row = (over: Partial<DbRow>): DbRow => ({
  id: "r1", title: "T", status: "Todo", priority: "Med", assignee: "", assignees: [], owner: null, createdBy: null,
  createdAt: "", followers: [], parentId: null, blockedBy: [], start: "", due: "", description: "", comments: [], cells: {}, ...over,
})

beforeEach(() => {
  queryMock.mockReset()
  queryMock.mockResolvedValue({ rows: [] })
})

describe("task index", () => {
  it("strips workspace prefixes from doc ids", () => {
    expect(bareDocId("workspace:room:abc")).toBe("abc")
    expect(bareDocId("workspace:abc")).toBe("abc")
    expect(bareDocId("abc")).toBe("abc")
  })

  it("records people as keys, drops bad dates and duplicate ids", () => {
    const me = { kind: "user" as const, id: "me" }
    const recs = taskIndexRecords([
      row({ id: "a", due: "2026-11-20", owner: me, createdBy: me, assignees: [{ kind: "agent", type: "autonomous" }], followers: [me] }),
      row({ id: "a", title: "dup" }),
      row({ id: "", title: "no id" }),
      row({ id: "b", due: "soon" }),
    ])
    expect(recs).toEqual([
      { row_id: "a", title: "T", status: "Todo", status_group: "todo", priority: "Med", due: "2026-11-20", owner_key: "user:me", creator_key: "user:me", assignee_keys: ["agent:autonomous"], follower_keys: ["user:me"] },
      { row_id: "b", title: "T", status: "Todo", status_group: "todo", priority: "Med", due: null, owner_key: null, creator_key: null, assignee_keys: [], follower_keys: [] },
    ])
  })

  it("stores each row's status group from the room's statuses", () => {
    const statuses = [
      { name: "Backlog", group: "todo" as const },
      { name: "Review", group: "in_progress" as const },
      { name: "Shipped", group: "done" as const },
      { name: "Won't do", group: "canceled" as const },
    ]
    const recs = taskIndexRecords(
      [row({ id: "a", status: "Shipped" }), row({ id: "b", status: "Won't do" }), row({ id: "c", status: "Review" }), row({ id: "d", status: "Done" })],
      statuses,
    )
    // A name the room no longer lists keeps its legacy meaning (Done → done).
    expect(recs.map((r) => r.status_group)).toEqual(["done", "canceled", "in_progress", "done"])
  })

  it("syncs a doc in one statement (after reading its statuses) and never throws", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ props: { dbStatuses: [{ name: "Open", group: "todo" }, { name: "Closed", group: "done" }] } }] })
    await syncTaskIndex("workspace:abc", [row({ id: "a", status: "Closed" })])
    expect(queryMock).toHaveBeenCalledTimes(2)
    expect(queryMock.mock.calls[0][1]).toEqual(["abc"])
    const [sql, params] = queryMock.mock.calls[1]
    expect(JSON.parse(params[2])[0].status_group).toBe("done")
    expect(sql).toContain("DELETE FROM dashboard.workspace_task_index")
    expect(params[0]).toBe("abc")
    expect(JSON.parse(params[2])).toHaveLength(1)
    queryMock.mockRejectedValueOnce(new Error("no table"))
    await expect(syncTaskIndex("abc", [])).resolves.toBeUndefined()
  })

  it("maps roles for the caller", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ doc_id: "abc", row_id: "a", title: "", status: "Doing", status_group: "in_progress", priority: "High", due: "2026-11-20", owner_key: "user:me", creator_key: "user:x", assignee_keys: ["user:me"], follower_keys: ["user:me"], room_title: null }],
    })
    const [t] = await tasksInvolving("user:me")
    expect(queryMock.mock.calls[0][0]).toContain("t.status_group NOT IN ('done', 'canceled')")
    expect(t).toEqual({ docId: "abc", rowId: "a", roomTitle: "Untitled room", title: "Untitled", status: "Doing", statusGroup: "in_progress", priority: "High", due: "2026-11-20", roles: ["assignee", "owner", "follower"] })
  })

  it("re-stamps a room's groups in one statement and never throws", async () => {
    await restampTaskIndexGroups("workspace:abc", [{ name: "Shipped", group: "done" }])
    const [sql, params] = queryMock.mock.calls[0]
    expect(sql).toContain("SET status_group")
    expect(params).toEqual(["abc", JSON.stringify([{ name: "Shipped", group: "done" }])])
    queryMock.mockRejectedValueOnce(new Error("no column"))
    await expect(restampTaskIndexGroups("abc", [])).resolves.toBeUndefined()
  })
})
