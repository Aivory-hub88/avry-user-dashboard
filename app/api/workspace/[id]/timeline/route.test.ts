/** Room timeline (ADR-019 P2): read gate, flat chronological feed, reply quotes, open tasks. */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { queryMock, authMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  authMock: vi.fn<(...args: unknown[]) => unknown>(() => null),
}))

vi.mock("@/lib/db", () => ({ query: queryMock }))
vi.mock("@/lib/serverAuth", () => ({ getAuthUserWithToken: () => authMock() }))

import { GET } from "./route"

const USER = { user: { user_id: "u1", email: "rina@x.id", account_type: "member" }, token: "t" }

const row = (over: Record<string, unknown>) => ({
  id: "m1",
  space_id: "room-1",
  thread_root: null,
  author_kind: "user",
  author_id: "u1",
  author_name: "rina@x.id",
  agent_type: null,
  body: "hello",
  mentions: [],
  member_ids: [],
  here: false,
  has_agent: false,
  doc_refs: [],
  created_at: "2026-09-26T10:00:00.000Z",
  ...over,
})

let member = true
let sqls: string[] = []

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockReturnValue(USER)
  member = true
  sqls = []
  queryMock.mockImplementation((sql: string) => {
    sqls.push(sql)
    if (sql.includes("FROM dashboard.workspace_docs"))
      return Promise.resolve({ rows: [{ id: "room-1", workspace_id: "team-1", owner: "boss" }] })
    if (sql.includes("workspace_doc_acl")) return Promise.resolve({ rows: [] })
    if (sql.includes("workspace_members")) return Promise.resolve({ rows: member ? [{ workspace_id: "team-1", role: "editor" }] : [] })
    if (sql.includes("FROM dashboard.workspace_messages m"))
      return Promise.resolve({
        rows: [
          row({}),
          row({
            id: "m2",
            thread_root: "m1",
            author_kind: "agent",
            author_id: "leads_qualifier",
            author_name: "Lex",
            agent_type: "leads_qualifier",
            body: "on it",
            created_at: "2026-09-26T10:01:00.000Z",
            q_kind: "user",
            q_id: "u1",
            q_name: "rina@x.id",
            q_agent: null,
            q_body: "hello",
          }),
        ],
      })
    if (sql.includes("FROM dashboard.workspace_agent_tasks"))
      return Promise.resolve({
        rows: [
          {
            id: "t1", space_id: "room-1", thread_root: "m1", trigger_msg: "m1", agent_type: "leads_qualifier",
            instruction: "x", status: "in_progress", reason: "running", result_msg: null, approval_ref: {},
            created_by: "user:u1", created_at: "2026-09-26T10:00:00.000Z", updated_at: "2026-09-26T10:00:05.000Z",
          },
        ],
      })
    return Promise.resolve({ rows: [] })
  })
})

const ctx = { params: Promise.resolve({ id: "room-1" }) }

describe("GET timeline", () => {
  it("401 without a session, 403 for someone outside the team", async () => {
    authMock.mockReturnValue(null)
    expect((await GET(new NextRequest("http://x/t"), ctx)).status).toBe(401)
    authMock.mockReturnValue(USER)
    member = false
    expect((await GET(new NextRequest("http://x/t"), ctx)).status).toBe(403)
  })

  it("returns roots and replies in one feed, with the quoted parent", async () => {
    const r = await GET(new NextRequest("http://x/t"), ctx)
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.messages.map((m: { id: string }) => m.id)).toEqual(["m1", "m2"])
    expect(j.messages[0]).toMatchObject({ authorName: "rina@x.id", replyTo: null })
    expect(j.messages[1].replyTo).toEqual({ id: "m1", kind: "user", authorId: "u1", name: "rina@x.id", agentType: null, body: "hello" })
    expect(j.tasks.map((t: { id: string; status: string }) => `${t.id}:${t.status}`)).toEqual(["t1:in_progress"])
  })

  it("?after narrows to newer messages", async () => {
    await GET(new NextRequest("http://x/t?after=2026-09-26T10:00:00.000Z"), ctx)
    expect(sqls.some((s) => s.includes("m.created_at > $2"))).toBe(true)
  })
})
