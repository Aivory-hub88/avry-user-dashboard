/**
 * GET /api/workspace/[id]/thread (Phase 1): root + replies oldest-first +
 * topic. 400 tanpa ?root=, 404 bila root bukan milik Space ini.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { queryMock, authMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  authMock: vi.fn<(...args: unknown[]) => unknown>(() => null),
}))

vi.mock("@/lib/db", () => ({
  query: queryMock,
  withTransaction: async (fn: (tx: (sql: string) => Promise<{ rows: unknown[] }>) => Promise<unknown>) =>
    fn(async () => ({ rows: [] })),
}))
vi.mock("@/lib/serverAuth", () => ({ getAuthUserWithToken: () => authMock() }))

import { GET, DELETE } from "./route"

process.env.COLLAB_SERVICE_TOKEN = "test-service-token"

const svc = { "x-service-token": "test-service-token" }

const msg = (id: string, threadRoot: string | null, created: string) => ({
  id,
  space_id: "space-1",
  thread_root: threadRoot,
  author_kind: "user",
  author_id: "user-sarah",
  author_name: "Sarah",
  agent_type: null,
  body: `body-${id}`,
  mentions: [],
  member_ids: [],
  here: false,
  has_agent: false,
  doc_refs: [],
  created_at: created,
  edited_at: null,
  deleted_at: null,
})

beforeEach(() => {
  queryMock.mockReset()
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes("thread_root IS NULL")) {
      return Promise.resolve({ rows: [msg("m1", null, "2026-09-17T10:00:00.000Z")] })
    }
    if (sql.includes("FROM dashboard.workspace_messages") && sql.includes("ORDER BY created_at ASC")) {
      return Promise.resolve({
        rows: [
          msg("m2", "m1", "2026-09-17T10:02:00.000Z"),
          msg("m3", "m1", "2026-09-17T10:03:00.000Z"),
        ],
      })
    }
    if (sql.includes("FROM dashboard.workspace_topics")) {
      return Promise.resolve({
        rows: [
          {
            id: "t1",
            thread_root: "m1",
            title: "Decide: launch cut",
            archived: false,
            doc_id: null,
            created_by: "user-sarah",
            created_at: "2026-09-17T10:01:00.000Z",
          },
        ],
      })
    }
    return Promise.resolve({ rows: [] })
  })
})

describe("GET /api/workspace/[id]/thread", () => {
  it("returns root + replies oldest-first + topic", async () => {
    const req = new NextRequest("http://localhost/api/workspace/space-1/thread?root=m1", {
      headers: svc,
    })
    const res = await GET(req, { params: Promise.resolve({ id: "space-1" }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.root.id).toBe("m1")
    expect(body.replies.map((r: { id: string }) => r.id)).toEqual(["m2", "m3"])
    expect(body.topic).toMatchObject({ id: "t1", title: "Decide: launch cut" })
    expect(body.truncated).toBe(false)
  })

  it("requires ?root=", async () => {
    const req = new NextRequest("http://localhost/api/workspace/space-1/thread", { headers: svc })
    const res = await GET(req, { params: Promise.resolve({ id: "space-1" }) })
    expect(res.status).toBe(400)
  })

  it("404s when the root is not in this space", async () => {
    queryMock.mockImplementation((sql: string) =>
      sql.includes("thread_root IS NULL")
        ? Promise.resolve({ rows: [] })
        : Promise.resolve({ rows: [] }),
    )
    const req = new NextRequest("http://localhost/api/workspace/space-1/thread?root=nope", {
      headers: svc,
    })
    const res = await GET(req, { params: Promise.resolve({ id: "space-1" }) })
    expect(res.status).toBe(404)
  })

  it("rejects unauthenticated callers", async () => {
    const req = new NextRequest("http://localhost/api/workspace/space-1/thread?root=m1")
    const res = await GET(req, { params: Promise.resolve({ id: "space-1" }) })
    expect(res.status).toBe(401)
  })
})

describe("DELETE /api/workspace/[id]/thread", () => {
  const del = (root: string | null, headers: Record<string, string> = svc) =>
    new NextRequest(
      root === null
        ? "http://localhost/api/workspace/space-1/thread"
        : `http://localhost/api/workspace/space-1/thread?root=${root}`,
      { method: "DELETE", headers },
    )
  const params = { params: Promise.resolve({ id: "space-1" }) }

  beforeEach(() => {
    queryMock.mockReset()
    authMock.mockReset()
    authMock.mockReturnValue(null)
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes("FROM dashboard.workspace_messages"))
        return Promise.resolve({
          rows: [{ author_kind: "system", author_id: "service" }],
        })
      return Promise.resolve({ rows: [], rowCount: 0 })
    })
  })

  it("deletes own thread + cascades (service author)", async () => {
    const res = await DELETE(del("m1"), params)
    expect(res.status).toBe(200)
    const delCall = queryMock.mock.calls.find((c) =>
      String(c[0]).includes("DELETE FROM dashboard.workspace_threads"),
    )
    expect(delCall).toBeDefined()
    expect(delCall![1]).toEqual(["m1"])
  })

  it("400s without ?root=, 404s unknown thread", async () => {
    expect((await DELETE(del(null), params)).status).toBe(400)
    queryMock.mockImplementation(() => Promise.resolve({ rows: [], rowCount: 0 }))
    expect((await DELETE(del("nope"), params)).status).toBe(404)
  })

  it("403s editor deleting other author's thread (bukan penulis/owner)", async () => {
    authMock.mockReturnValue({
      user: { user_id: "viewer-1", email: "v@x.id", account_type: "member" },
      token: "t",
    })
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes("FROM dashboard.workspace_docs"))
        return Promise.resolve({ rows: [{ id: "space-1", owner: "owner-1", workspace_id: "ws-1" }] })
      if (sql.includes("FROM dashboard.workspace_doc_acl"))
        return Promise.resolve({ rows: [{ doc_id: "space-1", role: "editor" }] })
      if (sql.includes("FROM dashboard.workspace_messages"))
        return Promise.resolve({ rows: [{ author_kind: "user", author_id: "other-1" }] })
      return Promise.resolve({ rows: [], rowCount: 0 })
    })
    const res = await DELETE(del("m1", {}), params)
    expect(res.status).toBe(403)
  })

  it("rejects unauthenticated callers", async () => {
    const res = await DELETE(del("m1", {}), params)
    expect(res.status).toBe(401)
  })
})
