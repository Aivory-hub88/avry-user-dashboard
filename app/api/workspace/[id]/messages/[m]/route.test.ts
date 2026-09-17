/**
 * PATCH/DELETE /api/workspace/[id]/messages/[m] (Phase 2): author-only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))

vi.mock("@/lib/db", () => ({ query: queryMock }))
vi.mock("@/lib/serverAuth", () => ({ getAuthUserWithToken: () => null }))

import { PATCH, DELETE } from "./route"

process.env.COLLAB_SERVICE_TOKEN = "test-service-token"

const svc = { "x-service-token": "test-service-token" }
const svcOtherAgent = { "x-service-token": "test-service-token", "x-agent-type": "leads_qualifier" }

const OWN_ROW = {
  id: "m1",
  space_id: "space-1",
  thread_root: null,
  author_kind: "system",
  author_id: "service",
  author_name: "service",
  agent_type: null,
  body: "old",
  mentions: [],
  member_ids: [],
  here: false,
  has_agent: false,
  doc_refs: [],
  created_at: "2026-09-17T10:00:00.000Z",
  edited_at: null,
  deleted_at: null,
}

function req(method: string, body: unknown, headers: Record<string, string> = svc) {
  return new NextRequest("http://localhost/api/workspace/space-1/messages/m1", {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const params = { params: Promise.resolve({ id: "space-1", m: "m1" }) }

beforeEach(() => {
  queryMock.mockReset()
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes("UPDATE dashboard.workspace_messages"))
      return Promise.resolve({ rows: [{ ...OWN_ROW, body: "new" }], rowCount: 1 })
    if (sql.includes("FROM dashboard.workspace_messages"))
      return Promise.resolve({ rows: [OWN_ROW] })
    return Promise.resolve({ rows: [], rowCount: 0 })
  })
})

describe("PATCH /api/workspace/[id]/messages/[m]", () => {
  it("edits own message + re-stamps mentions", async () => {
    const res = await PATCH(req("PATCH", { body: "baru [@Geno](#agent:autonomous)" }), params)
    expect(res.status).toBe(200)
    const update = queryMock.mock.calls.find((c) => String(c[0]).includes("UPDATE dashboard.workspace_messages"))
    expect((update![1] as unknown[])[1]).toEqual(["autonomous"])
  })

  it("403s for other authors", async () => {
    const res = await PATCH(req("PATCH", { body: "x" }, svcOtherAgent), params)
    expect(res.status).toBe(403)
  })

  it("404s on unknown message", async () => {
    queryMock.mockImplementation(() => Promise.resolve({ rows: [], rowCount: 0 }))
    const res = await PATCH(req("PATCH", { body: "x" }), params)
    expect(res.status).toBe(404)
  })
})

describe("DELETE /api/workspace/[id]/messages/[m]", () => {
  it("tombstones own message (body → '', no physical delete)", async () => {
    const res = await DELETE(req("DELETE", undefined), params)
    expect(res.status).toBe(200)
    const update = queryMock.mock.calls.find((c) => String(c[0]).includes("UPDATE dashboard.workspace_messages"))
    expect(String(update![0])).toContain("deleted_at")
    expect(String(update![0])).not.toContain("DELETE FROM")
  })

  it("403s for other authors", async () => {
    const res = await DELETE(req("DELETE", undefined, svcOtherAgent), params)
    expect(res.status).toBe(403)
  })
})
