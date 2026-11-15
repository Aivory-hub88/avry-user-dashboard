/**
 * GET /api/workspace/tasks/mine: the viewer's open tasks across rooms from
 * the task index, minus rooms they can't read. People only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { queryMock, authMock, canReadMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  authMock: vi.fn<(...args: unknown[]) => unknown>(() => null),
  canReadMock: vi.fn(async (_c: unknown, docId: string) => docId !== "secret"),
}))

vi.mock("@/lib/db", () => ({ query: queryMock }))
vi.mock("@/lib/serverAuth", () => ({ getAuthUserWithToken: () => authMock() }))
vi.mock("@/lib/workspaceAccess", async (orig) => ({ ...(await orig<object>()), canReadDocId: canReadMock }))
vi.mock("@/lib/planGate", async (orig) => ({
  ...(await orig<typeof import("@/lib/planGate")>()),
  requirePaidPlan: async () => ({ ok: true }),
}))

import { GET } from "./route"
import { POST as backfill } from "../index/backfill/route"

process.env.COLLAB_SERVICE_TOKEN = "test-service-token"
const as = (id: string) => ({ user: { user_id: id, email: `${id}@x.id`, account_type: "member" }, token: `jwt-${id}` })
const line = (doc: string, row: string) => ({
  doc_id: doc, row_id: row, title: row, status: "Todo", priority: "Med", due: null,
  owner_key: "user:me", creator_key: null, assignee_keys: [], follower_keys: [], room_title: doc,
})

beforeEach(() => {
  vi.clearAllMocks()
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes("FROM dashboard.workspace_task_index t")) return Promise.resolve({ rows: [line("room1", "a"), line("secret", "b"), line("room1", "c")] })
    if (sql.startsWith("SELECT id FROM dashboard.workspace_docs")) return Promise.resolve({ rows: [{ id: "workspace:room1" }, { id: "room1" }, { id: "workspace:page2" }] })
    return Promise.resolve({ rows: [] })
  })
})

describe("GET /api/workspace/tasks/mine", () => {
  it("401 without a login, 403 for the service token", async () => {
    expect((await GET(new NextRequest("http://localhost/api/workspace/tasks/mine"))).status).toBe(401)
    const svc = new NextRequest("http://localhost/api/workspace/tasks/mine", { headers: { "x-service-token": "test-service-token" } })
    expect((await GET(svc)).status).toBe(403)
  })

  it("returns the caller's tasks from rooms they can read", async () => {
    authMock.mockReturnValue(as("me"))
    const res = await GET(new NextRequest("http://localhost/api/workspace/tasks/mine"))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.tasks.map((t: { rowId: string }) => t.rowId)).toEqual(["a", "c"])
    expect(j.tasks[0].roles).toEqual(["owner"])
    const call = queryMock.mock.calls.find(([sql]) => String(sql).includes("workspace_task_index"))
    expect(call?.[1]).toEqual(["user:me"])
    // One access check per room, not per task.
    expect(canReadMock).toHaveBeenCalledTimes(2)
  })
})

describe("POST /api/workspace/tasks/index/backfill", () => {
  it("is service-only and scans each doc once", async () => {
    authMock.mockReturnValue(as("me"))
    expect((await backfill(new NextRequest("http://localhost/x", { method: "POST" }))).status).toBe(403)
    authMock.mockReturnValue(null)
    const res = await backfill(new NextRequest("http://localhost/x", { method: "POST", headers: { "x-service-token": "test-service-token" } }))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.scanned).toBe(2)
    expect(j.failed).toBe(0)
  })
})
