import { describe, expect, it, vi, beforeEach } from "vitest"

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))
vi.mock("@/lib/db", () => ({ query: queryMock }))

import { bareDocId, syncTaskIndex, taskIndexRecords, tasksInvolving } from "./workspaceTaskIndex"
import type { DbRow } from "./workspaceDb"

const row = (over: Partial<DbRow>): DbRow => ({
  id: "r1", title: "T", status: "Todo", priority: "Med", assignee: "", assignees: [], owner: null, createdBy: null,
  createdAt: "", followers: [], start: "", due: "", description: "", comments: [], cells: {}, ...over,
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
      { row_id: "a", title: "T", status: "Todo", priority: "Med", due: "2026-11-20", owner_key: "user:me", creator_key: "user:me", assignee_keys: ["agent:autonomous"], follower_keys: ["user:me"] },
      { row_id: "b", title: "T", status: "Todo", priority: "Med", due: null, owner_key: null, creator_key: null, assignee_keys: [], follower_keys: [] },
    ])
  })

  it("syncs a doc in one statement and never throws", async () => {
    await syncTaskIndex("workspace:abc", [row({ id: "a" })])
    expect(queryMock).toHaveBeenCalledTimes(1)
    const [sql, params] = queryMock.mock.calls[0]
    expect(sql).toContain("DELETE FROM dashboard.workspace_task_index")
    expect(params[0]).toBe("abc")
    expect(JSON.parse(params[2])).toHaveLength(1)
    queryMock.mockRejectedValueOnce(new Error("no table"))
    await expect(syncTaskIndex("abc", [])).resolves.toBeUndefined()
  })

  it("maps roles for the caller", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ doc_id: "abc", row_id: "a", title: "", status: "Doing", priority: "High", due: "2026-11-20", owner_key: "user:me", creator_key: "user:x", assignee_keys: ["user:me"], follower_keys: ["user:me"], room_title: null }],
    })
    const [t] = await tasksInvolving("user:me")
    expect(t).toEqual({ docId: "abc", rowId: "a", roomTitle: "Untitled room", title: "Untitled", status: "Doing", priority: "High", due: "2026-11-20", roles: ["assignee", "owner", "follower"] })
  })
})
