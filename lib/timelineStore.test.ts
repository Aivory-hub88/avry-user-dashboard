/** Project timeline data (ADR-019 P6): tasks from Yjs, notes, jobs, requests, access. */
import { describe, it, expect, vi, beforeEach } from "vitest"
import * as Y from "yjs"

const { queryMock, rolesMock } = vi.hoisted(() => ({ queryMock: vi.fn(), rolesMock: vi.fn() }))
vi.mock("@/lib/db", () => ({ query: queryMock }))
vi.mock("@/lib/workspaceAccess", () => ({
  getDocRolesBatch: rolesMock,
  canWrite: (r: string | null) => r === "owner" || r === "editor",
}))

import { cleanTimeZone, loadTimeline } from "@/lib/timelineStore"
import { cleanNoteInput } from "@/lib/roomNotes"
import { dbRowToYMap } from "@/lib/workspaceDb"

const cred = { kind: "user" as const, token: "t", user: { user_id: "u1" } } as never

function board(): Buffer {
  const doc = new Y.Doc()
  const row = (id: string, start: string, due: string) =>
    dbRowToYMap({ id, title: id, status: "Doing", priority: "Med", assignee: "", start, due, description: "", comments: [], cells: {} })
  doc.getArray<Y.Map<unknown>>("database").push([row("in", "2026-09-20", "2026-09-25"), row("undated", "", ""), row("later", "", "2027-03-01")])
  return Buffer.from(Y.encodeStateAsUpdate(doc))
}

beforeEach(() => {
  queryMock.mockReset()
  rolesMock.mockReset()
  rolesMock.mockImplementation(async (_c: unknown, ids: string[]) => new Map(ids.map((id) => [id, id === "r2" ? "viewer" : "editor"])))
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes("SELECT d.id, d.title, w.name AS team_name"))
      return Promise.resolve({
        rows: [
          { id: "r1", title: "Odoo rollout", team_name: "Ops", props: { brief: { deadline: "2026-10-01" } } },
          { id: "r2", title: "Read only", team_name: "Ops", props: {} },
        ],
      })
    if (sql.includes("SELECT id, yjs_update")) return Promise.resolve({ rows: [{ id: "workspace:r1", yjs_update: board() }, { id: "workspace:r2", yjs_update: board() }] })
    if (sql.includes("FROM dashboard.room_notes"))
      return Promise.resolve({ rows: [{ id: "n1", room_id: "r1", title: "Call client", body: "b", on_date: "2026-09-22", for_kind: "agent", for_id: "sales_agent", for_name: "Sales" }] })
    if (sql.includes("FROM dashboard.workspace_agent_tasks"))
      return Promise.resolve({ rows: [{ space_id: "r1", agent_type: "sales_agent", day: "2026-09-21", n: 3, failed: 1 }, { space_id: "r1", agent_type: "x", day: "2026-08-01", n: 1, failed: 0 }] })
    if (sql.includes("FROM dashboard.project_requests"))
      return Promise.resolve({ rows: [{ id: "q1", title: "New CRM", status: "submitted", deadline: "2026-10-10", opened: "2026-09-15", team_name: "Ops" }] })
    return Promise.resolve({ rows: [] })
  })
})

describe("loadTimeline", () => {
  it("builds groups with in-window tasks, deadline, notes, jobs and requests", async () => {
    const t = await loadTimeline({ cred, roomId: null, from: "2026-09-14", to: "2026-10-25", tz: "Asia/Jakarta" })
    const r1 = t.groups.find((g) => g.roomId === "r1")!
    expect(r1.unscheduled).toBe(1)
    expect(r1.items.filter((i) => i.kind === "task").map((i) => i.rowId)).toEqual(["in"])
    expect(r1.items.find((i) => i.kind === "task")!.editable).toBe(true)
    expect(r1.items.some((i) => i.kind === "deadline" && i.start === "2026-10-01")).toBe(true)
    expect(r1.items.find((i) => i.kind === "note")).toMatchObject({ forKind: "agent", forName: "Sales", start: "2026-09-22" })
    const jobs = r1.items.filter((i) => i.kind === "job")
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ count: 3, failed: 1 })
    expect(t.groups.find((g) => g.roomId === "r2")!.items.find((i) => i.kind === "task")!.editable).toBe(false)
    expect(t.requests).toEqual([expect.objectContaining({ requestId: "q1", start: "2026-09-15", end: "2026-10-10" })])
  })

  it("hides rooms the caller has no role in and skips requests in room mode", async () => {
    rolesMock.mockImplementation(async () => new Map([["r1", null]]))
    const t = await loadTimeline({ cred, roomId: "r1", from: "2026-09-14", to: "2026-10-25", tz: "UTC" })
    expect(t.groups).toEqual([])
    expect(t.requests).toEqual([])
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes("project_requests"))).toBe(false)
  })
})

describe("cleanTimeZone", () => {
  it("keeps real IANA zones and falls back to UTC", () => {
    expect(cleanTimeZone("Asia/Jakarta")).toBe("Asia/Jakarta")
    expect(cleanTimeZone("Mars/Olympus")).toBe("UTC")
    expect(cleanTimeZone("'; DROP TABLE x")).toBe("UTC")
    expect(cleanTimeZone(undefined)).toBe("UTC")
  })
})

describe("cleanNoteInput (P6)", () => {
  it("accepts a real day or a clear, and a well-formed addressee", () => {
    expect(cleanNoteInput({ onDate: "2026-10-02", for: { kind: "agent", id: "sales_agent" } })).toEqual({ onDate: "2026-10-02", for: { kind: "agent", id: "sales_agent" } })
    expect(cleanNoteInput({ onDate: "", for: null })).toEqual({ onDate: null, for: null })
    expect(cleanNoteInput({ onDate: "2026-02-31", for: { kind: "admin", id: "x" } })).toEqual({})
  })
})
