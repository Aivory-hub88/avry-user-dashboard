/**
 * PATCH /api/aira/tasks/[taskId] — operator Stop on the task ledger.
 *
 * Tenant isolation (task_id + JWT user must match, foreign ids 404 without
 * leaking existence), terminal states 409, happy path flips to cancelled.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { queryMock, credMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  credMock: vi.fn<(...args: unknown[]) => unknown>(() => null),
}))

vi.mock("@/lib/db", () => ({ query: queryMock }))
vi.mock("@/lib/workspaceAuth", () => ({
  workspaceCredential: (...args: unknown[]) => credMock(...args),
  unauthorized: () => Response.json({ error: "unauthorized" }, { status: 401 }),
}))

import { PATCH } from "./route"

process.env.COLLAB_SERVICE_TOKEN = "test-service-token"

const USER = {
  kind: "user",
  user: { user_id: "u1", email: "a@x.id", account_type: "member" },
  token: "jwt-1",
}

function req(body: unknown): NextRequest {
  return new NextRequest("http://x/api/aira/tasks/t1", {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

const params = { params: Promise.resolve({ taskId: "t1" }) }

const ROW = {
  task_id: "t1",
  tenant_id: "u1",
  agent_type: "leads_qualifier",
  session_id: "s1",
  title: "Qualify Acme",
  status: "cancelled",
  priority: "normal",
  blocked_reason: "Stopped by operator from Mission Control",
  created_at: "2026-09-18T10:00:00Z",
  updated_at: "2026-09-18T12:00:00Z",
}

beforeEach(() => {
  queryMock.mockReset()
  credMock.mockReset()
  credMock.mockReturnValue(USER)
})

describe("PATCH stop", () => {
  it("401 without credentials", async () => {
    credMock.mockReturnValue(null)
    const r = await PATCH(req({ action: "stop" }), params)
    expect(r.status).toBe(401)
  })

  it("400 on unknown action", async () => {
    const r = await PATCH(req({ action: "nuke" }), params)
    expect(r.status).toBe(400)
  })

  it("403 for service callers (user session required)", async () => {
    credMock.mockReturnValue({ kind: "service", token: "s" })
    const r = await PATCH(req({ action: "stop" }), params)
    expect(r.status).toBe(403)
  })

  it("stops an open row and returns it", async () => {
    queryMock.mockResolvedValue({ rows: [ROW], rowCount: 1 })
    const r = await PATCH(req({ action: "stop" }), params)
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.task.status).toBe("cancelled")
    const sql = String(queryMock.mock.calls[0][0])
    expect(sql).toContain("status = 'cancelled'")
    expect(sql).toContain("tenant_id = $2")
    expect(queryMock.mock.calls[0][1]).toEqual([
      "t1",
      "u1",
      ["todo", "in_progress", "blocked"],
    ])
  })

  it("404 for foreign/missing rows without leaking existence", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    const r = await PATCH(req({ action: "stop" }), params)
    expect(r.status).toBe(404)
  })

  it("409 when already terminal", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ status: "done" }], rowCount: 1 })
    const r = await PATCH(req({ action: "stop" }), params)
    expect(r.status).toBe(409)
    expect((await r.json()).error).toContain("already done")
  })
})
