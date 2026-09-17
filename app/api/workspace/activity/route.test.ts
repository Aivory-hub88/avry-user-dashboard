/**
 * Activity inbox (Phase 5): ranking mention > here > reply, unread via
 * watermark, space tak-terbaca dilewati, read-all monotone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { queryMock, authMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  authMock: vi.fn<(...args: unknown[]) => unknown>(() => null),
}))

vi.mock("@/lib/db", () => ({ query: queryMock }))
vi.mock("@/lib/serverAuth", () => ({ getAuthUserWithToken: () => authMock() }))

import { GET, POST } from "./route"
import { classifyRow, rankItems, readerOf } from "@/lib/spaceActivity"

process.env.COLLAB_SERVICE_TOKEN = "test-service-token"

const USER = { user: { user_id: "u1", email: "sarah@x.id", account_type: "member" }, token: "jwt-1" }

const msg = (over: Record<string, unknown>) => ({
  id: "m1",
  space_id: "space-1",
  thread_root: "m0",
  author_kind: "user",
  author_id: "other",
  author_name: "John",
  agent_type: null,
  body: "halo",
  mentions: [],
  member_ids: [],
  here: false,
  created_at: "2026-09-17T10:00:00.000Z",
  ...over,
})

function setup(rows: Record<string, unknown>[], spaces = ["space-1"]) {
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes("DISTINCT thread_root")) return Promise.resolve({ rows: [{ thread_root: "m0" }] })
    if (sql.includes("FROM dashboard.workspace_messages"))
      return Promise.resolve({ rows, rowCount: rows.length })
    if (sql.includes("FROM dashboard.workspace_read_marks")) return Promise.resolve({ rows: [] })
    if (sql.includes("workspace_docs")) {
      // getDocRolesBatch user path — beri akses penuh ke spaces.
      if (sql.includes("workspace_members"))
        return Promise.resolve({ rows: spaces.map((s) => ({ workspace_id: "default", role: "editor" })) })
      return Promise.resolve({ rows: [] })
    }
    return Promise.resolve({ rows: [], rowCount: 0 })
  })
}

beforeEach(() => {
  queryMock.mockReset()
  authMock.mockReset()
  authMock.mockReturnValue(USER)
})

describe("classifyRow + rankItems (pure)", () => {
  const reader = readerOf("user", "u1")!
  it("mention > here > reply", () => {
    expect(classifyRow(msg({ mentions: [], member_ids: ["u1"] }), reader, new Set())).toBe("mention")
    expect(classifyRow(msg({ here: true }), reader, new Set())).toBe("here")
    expect(classifyRow(msg({}), reader, new Set(["m0"]))).toBe("reply")
    expect(classifyRow(msg({}), reader, new Set(["lain"]))).toBeNull()
  })

  it("ranks mention first, newest first within kind", () => {
    const items = [
      { kind: "reply", spaceId: "s", threadRoot: "m0", messageId: "a", authorName: "J", excerpt: "", createdAt: "2026-09-17T11:00:00.000Z", unread: true },
      { kind: "mention", spaceId: "s", threadRoot: "m0", messageId: "b", authorName: "G", excerpt: "", createdAt: "2026-09-17T09:00:00.000Z", unread: true },
    ] as Parameters<typeof rankItems>[0]
    expect(rankItems(items).map((i) => i.messageId)).toEqual(["b", "a"])
  })
})

describe("GET /api/workspace/activity", () => {
  it("returns ranked items with unread flags", async () => {
    setup([
      msg({ id: "m-reply", member_ids: [], created_at: "2026-09-17T11:00:00.000Z" }),
      msg({ id: "m-mention", member_ids: ["u1"], created_at: "2026-09-17T09:00:00.000Z" }),
    ])
    const res = await GET(new NextRequest("http://localhost/api/workspace/activity"))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.items.map((i: { messageId: string }) => i.messageId)).toEqual(["m-mention", "m-reply"])
    expect(j.unread).toBe(2)
  })

  it("marks read items via watermark", async () => {
    setup([msg({ id: "m1", member_ids: ["u1"] })])
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes("DISTINCT thread_root")) return Promise.resolve({ rows: [] })
      if (sql.includes("FROM dashboard.workspace_messages"))
        return Promise.resolve({ rows: [msg({ id: "m1", member_ids: ["u1"] })], rowCount: 1 })
      if (sql.includes("FROM dashboard.workspace_read_marks"))
        return Promise.resolve({
          rows: [{ space_id: "space-1", thread_root: "m0", updated_at: new Date("2026-09-17T12:00:00.000Z") }],
        })
      return Promise.resolve({ rows: [], rowCount: 0 })
    })
    const res = await GET(new NextRequest("http://localhost/api/workspace/activity"))
    const j = await res.json()
    expect(j.items[0].unread).toBe(false)
    expect(j.unread).toBe(0)
  })

  it("requires auth", async () => {
    authMock.mockReturnValue(null)
    const res = await GET(new NextRequest("http://localhost/api/workspace/activity"))
    expect(res.status).toBe(401)
  })

  it("400s unknown service agents", async () => {
    authMock.mockReturnValue(null)
    const res = await GET(
      new NextRequest("http://localhost/api/workspace/activity", {
        headers: { "x-service-token": "test-service-token", "x-agent-type": "ghost" },
      }),
    )
    expect(res.status).toBe(400)
  })
})

describe("POST /api/workspace/activity/read-all", () => {
  function post(body: unknown) {
    return new NextRequest("http://localhost/api/workspace/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  it("upserts the watermark (monotone)", async () => {
    const res = await POST(post({ spaceId: "space-1", threadRoot: "m0" }))
    expect(res.status).toBe(200)
    const upsert = queryMock.mock.calls.find((c) => String(c[0]).includes("workspace_read_marks"))
    expect(upsert).toBeDefined()
    expect(String(upsert![0])).toContain("ON CONFLICT")
    expect(upsert![1]).toEqual(["space-1", "user:u1", "m0"])
  })

  it("400s without spaceId (no blind sweep)", async () => {
    const res = await POST(post({}))
    expect(res.status).toBe(400)
  })
})
