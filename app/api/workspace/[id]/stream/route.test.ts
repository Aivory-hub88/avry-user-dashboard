/**
 * GET /api/workspace/[id]/stream (Phase 1): roots newest-first +
 * replyCount + topic + truncated. Auth mengikuti pola activity route.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))

vi.mock("@/lib/db", () => ({ query: queryMock }))
vi.mock("@/lib/serverAuth", () => ({ getAuthUserWithToken: () => null }))

import { GET } from "./route"

process.env.COLLAB_SERVICE_TOKEN = "test-service-token"

const svc = { "x-service-token": "test-service-token" }
const svcAgent = { "x-service-token": "test-service-token", "x-agent-type": "leads_qualifier" }

const ROOT_ROW = {
  id: "m1",
  space_id: "space-1",
  thread_root: null,
  author_kind: "user",
  author_id: "user-sarah",
  author_name: "Sarah",
  agent_type: null,
  body: "Launch cut Jumat?",
  mentions: [],
  member_ids: [],
  here: false,
  has_agent: false,
  doc_refs: [],
  created_at: "2026-09-17T10:00:00.000Z",
  edited_at: null,
  deleted_at: null,
  reply_count: "4",
  topic_id: "t1",
  topic_title: "Decide: launch cut",
  topic_archived: false,
  topic_doc: null,
  topic_by: "user-sarah",
  topic_at: "2026-09-17T10:01:00.000Z",
}

beforeEach(() => {
  queryMock.mockReset()
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 })
})

describe("GET /api/workspace/[id]/stream", () => {
  it("returns empty stream without rows", async () => {
    const req = new NextRequest("http://localhost/api/workspace/space-1/stream", { headers: svc })
    const res = await GET(req, { params: Promise.resolve({ id: "space-1" }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ roots: [], truncated: false })
  })

  it("maps roots with replyCount + topic, truncated at cap", async () => {
    queryMock.mockResolvedValue({ rows: [ROOT_ROW], rowCount: 1 })
    const req = new NextRequest("http://localhost/api/workspace/space-1/stream?limit=1", {
      headers: svc,
    })
    const res = await GET(req, { params: Promise.resolve({ id: "space-1" }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.truncated).toBe(true)
    expect(body.roots).toHaveLength(1)
    expect(body.roots[0]).toMatchObject({
      id: "m1",
      replyCount: 4,
      topic: { id: "t1", title: "Decide: launch cut", archived: false },
    })
  })

  it("passes before/after windows to SQL", async () => {
    const req = new NextRequest(
      "http://localhost/api/workspace/space-1/stream?before=2026-09-17T11:00:00.000Z&after=2026-09-17T09:00:00.000Z",
      { headers: svc },
    )
    await GET(req, { params: Promise.resolve({ id: "space-1" }) })
    const sql = String(queryMock.mock.calls[0][0])
    expect(sql).toContain("m.created_at <")
    expect(sql).toContain("m.created_at >")
    expect(queryMock.mock.calls[0][1]).toEqual([
      "space-1",
      "2026-09-17T11:00:00.000Z",
      "2026-09-17T09:00:00.000Z",
    ])
  })

  it("rejects unauthenticated callers", async () => {
    const req = new NextRequest("http://localhost/api/workspace/space-1/stream")
    const res = await GET(req, { params: Promise.resolve({ id: "space-1" }) })
    expect(res.status).toBe(401)
  })

  it("forbids agents without a grant on the doc", async () => {
    const req = new NextRequest("http://localhost/api/workspace/space-1/stream", {
      headers: svcAgent,
    })
    const res = await GET(req, { params: Promise.resolve({ id: "space-1" }) })
    expect(res.status).toBe(403)
  })
})
