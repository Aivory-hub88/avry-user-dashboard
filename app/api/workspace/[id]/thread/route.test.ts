/**
 * GET /api/workspace/[id]/thread (Phase 1): root + replies oldest-first +
 * topic. 400 tanpa ?root=, 404 bila root bukan milik Space ini.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))

vi.mock("@/lib/db", () => ({ query: queryMock }))
vi.mock("@/lib/serverAuth", () => ({ getAuthUserWithToken: () => null }))

import { GET } from "./route"

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
