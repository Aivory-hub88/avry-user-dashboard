/**
 * POST /api/workspace/rooms: a team owner opens a room directly. It files an
 * already-submitted request and approves it, so the room gets the same setup
 * as any approved request.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { queryMock, authMock, kickoffMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  authMock: vi.fn<(...args: unknown[]) => unknown>(() => null),
  kickoffMock: vi.fn(async () => {}),
}))

vi.mock("@/lib/db", () => ({
  query: queryMock,
  withTransaction: (fn: (tx: typeof queryMock) => unknown) => fn(queryMock),
}))
vi.mock("@/lib/serverAuth", () => ({ getAuthUserWithToken: () => authMock() }))
vi.mock("@/lib/workspaceActivity", () => ({ recordWorkspaceActivity: vi.fn(async () => {}) }))
vi.mock("@/lib/roomProactive", async (orig) => ({ ...(await orig<object>()), onRoomOpened: kickoffMock }))
vi.mock("@/lib/planGate", async (orig) => ({
  ...(await orig<typeof import("@/lib/planGate")>()),
  requirePaidPlan: async () => ({ ok: true }),
}))

import { POST } from "./route"

const as = (id: string) => ({ user: { user_id: id, email: `${id}@x.id`, account_type: "member" }, token: `jwt-${id}` })
let calls: { sql: string; params: unknown[] }[]
let failApprove: boolean

beforeEach(() => {
  vi.clearAllMocks()
  calls = []
  failApprove = false
  queryMock.mockImplementation((sql: string, params: unknown[] = []) => {
    const s = sql.replace(/\s+/g, " ").trim()
    calls.push({ sql: s, params })
    if (s.startsWith("SELECT owner FROM dashboard.workspaces")) return Promise.resolve({ rows: params[0] === "team-1" ? [{ owner: "boss" }] : [] })
    if (s.startsWith("SELECT role FROM dashboard.workspace_members"))
      return Promise.resolve({ rows: params[1] === "rina" ? [{ role: "editor" }] : params[1] === "vic" ? [{ role: "viewer" }] : [] })
    if (s.startsWith("INSERT INTO dashboard.project_requests"))
      return Promise.resolve({
        rows: [
          {
            id: params[0], workspace_id: params[1], title: params[2], goal: params[3], deadline: params[4], priority: "Med",
            status: "submitted", requested_by: params[5], requested_by_name: params[6], fields: [], data_table: { columns: [], rows: [] },
            members: [], agents: params[8], created_at: "2026-11-15T10:00:00Z", updated_at: "2026-11-15T10:00:00Z",
          },
        ],
      })
    if (s.startsWith("UPDATE dashboard.project_requests SET status = 'approved'")) {
      if (failApprove) return Promise.reject(new Error("db down"))
      return Promise.resolve({ rows: [{ id: params[0] }], rowCount: 1 })
    }
    return Promise.resolve({ rows: [], rowCount: 1 })
  })
})

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/workspace/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })

describe("POST /api/workspace/rooms", () => {
  it("401 without a session", async () => {
    expect((await POST(req({ workspaceId: "team-1", title: "Launch" }))).status).toBe(401)
  })

  it("403 for editors (with a hint to send a request), viewers and outsiders", async () => {
    authMock.mockReturnValue(as("rina"))
    const r = await POST(req({ workspaceId: "team-1", title: "Launch" }))
    expect(r.status).toBe(403)
    expect((await r.json()).error).toMatch(/Send a request/)
    for (const who of ["vic", "stranger"]) {
      authMock.mockReturnValue(as(who))
      expect((await POST(req({ workspaceId: "team-1", title: "Launch" }))).status).toBe(403)
    }
    expect(calls.some((c) => c.sql.startsWith("INSERT INTO dashboard.project_requests"))).toBe(false)
  })

  it("400 without a team or a name", async () => {
    authMock.mockReturnValue(as("boss"))
    expect((await POST(req({ title: "Launch" }))).status).toBe(400)
    expect((await POST(req({ workspaceId: "team-1", title: " " }))).status).toBe(400)
    expect((await POST(req({ workspaceId: "team-1", title: "x" }))).status).toBe(400)
  })

  it("owner: files a submitted request, approves it and returns the new room", async () => {
    authMock.mockReturnValue(as("boss"))
    const r = await POST(req({ workspaceId: "team-1", title: "Website relaunch", goal: "New site by March", agents: ["autonomous"] }))
    expect(r.status).toBe(201)
    const body = await r.json()
    expect(body.roomId).toEqual(expect.any(String))
    const insert = calls.find((c) => c.sql.startsWith("INSERT INTO dashboard.project_requests"))!
    expect(insert.sql).toContain("'submitted'")
    expect(insert.params.slice(1, 4)).toEqual(["team-1", "Website relaunch", "New site by March"])
    const approve = calls.find((c) => c.sql.startsWith("UPDATE dashboard.project_requests SET status = 'approved'"))!
    expect(approve.params).toEqual([body.requestId, "boss", "Opened directly by a team owner", body.roomId])
    const docs = calls.filter((c) => c.sql.startsWith("INSERT INTO dashboard.workspace_docs"))
    expect(docs.map((d) => d.params[0])).toEqual([body.roomId, `workspace:${body.roomId}`])
    expect(calls.some((c) => c.sql.startsWith("INSERT INTO dashboard.workspace_agent_acl") && c.params[1] === "autonomous")).toBe(true)
  })

  it("removes the request again when opening the room fails", async () => {
    authMock.mockReturnValue(as("boss"))
    failApprove = true
    expect((await POST(req({ workspaceId: "team-1", title: "Website relaunch" }))).status).toBe(500)
    expect(calls.some((c) => c.sql.startsWith("DELETE FROM dashboard.project_requests"))).toBe(true)
  })
})
