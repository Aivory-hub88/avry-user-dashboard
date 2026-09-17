/**
 * POST /api/workspace/[id]/messages (Phase 2): tulis root/reply +
 * stamp server-side + un-archive otomatis. Viewer 403.
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

import { POST } from "./route"

process.env.COLLAB_SERVICE_TOKEN = "test-service-token"

const svc = { "x-service-token": "test-service-token" }
const svcAgent = { "x-service-token": "test-service-token", "x-agent-type": "autonomous" }

const msgRow = (over: Record<string, unknown> = {}) => ({
  id: "m-new",
  space_id: "space-1",
  thread_root: null,
  author_kind: "system",
  author_id: "service",
  author_name: "service",
  agent_type: null,
  body: "hello",
  mentions: [],
  member_ids: [],
  here: false,
  has_agent: false,
  doc_refs: [],
  created_at: "2026-09-17T10:00:00.000Z",
  edited_at: null,
  deleted_at: null,
  ...over,
})

function post(body: unknown, headers: Record<string, string> = svc) {
  return new NextRequest("http://localhost/api/workspace/space-1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  queryMock.mockReset()
  authMock.mockReset()
  authMock.mockReturnValue(null)
  queryMock.mockImplementation((sql: string, params?: unknown[]) => {
    if (sql.includes("INSERT INTO dashboard.workspace_messages"))
      return Promise.resolve({
        rows: [msgRow({ id: params?.[0] as string, thread_root: (params?.[2] as string | null) ?? null })],
        rowCount: 1,
      })
    if (sql.includes("FROM dashboard.workspace_messages"))
      return Promise.resolve({ rows: [msgRow({ id: "m1" })] })
    if (sql.includes("UPDATE dashboard.workspace_topics"))
      return Promise.resolve({ rows: [], rowCount: 0 })
    return Promise.resolve({ rows: [], rowCount: 0 })
  })
})

describe("POST /api/workspace/[id]/messages", () => {
  it("creates a root thread + message (201)", async () => {
    const res = await POST(post({ body: "Launch cut Jumat?" }), {
      params: Promise.resolve({ id: "space-1" }),
    })
    expect(res.status).toBe(201)
    const j = await res.json()
    expect(j.message.body).toBe("hello")
    expect(j.threadRoot).toBe(j.message.id) // root: thread id = root message id
    expect(j.unarchived).toBe(false)
    const insertCall = queryMock.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO dashboard.workspace_messages"),
    )
    expect(insertCall).toBeDefined()
  })

  it("stamps tokens + plain names, ignores code blocks", async () => {
    const body =
      "Tolong [@Geno](#agent:autonomous) cek, `@Aira` kutipan, dan @Finn bantu\n```\n[@Teo](#agent:customer_service)\n```"
    const res = await POST(post({ body }), { params: Promise.resolve({ id: "space-1" }) })
    expect(res.status).toBe(201)
    const insertCall = queryMock.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO dashboard.workspace_messages"),
    )
    const params = insertCall![1] as unknown[]
    expect(params[8]).toEqual(["autonomous", "finance_invoice_ops"]) // token + nama polos
    expect(params[11]).toBe(true) // has_agent
  })

  it("enqueues one agent task per stamped agent (dispatcher)", async () => {
    queryMock.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes("FROM dashboard.workspace_agent_tasks"))
        return Promise.resolve({ rows: [] })
      if (sql.includes("INSERT INTO dashboard.workspace_agent_tasks"))
        return Promise.resolve({
          rows: [
            {
              id: "task-1",
              space_id: "space-1",
              thread_root: "m1",
              trigger_msg: "m-new",
              agent_type: params?.[4],
              instruction: "Tolong @Geno cek",
              status: "todo",
              reason: "mention",
              result_msg: null,
              approval_ref: {},
              created_by: "system:service",
              created_at: "2026-09-17T10:00:00.000Z",
              updated_at: "2026-09-17T10:00:00.000Z",
            },
          ],
          rowCount: 1,
        })
      if (sql.includes("INSERT INTO dashboard.workspace_messages"))
        return Promise.resolve({
          rows: [msgRow({ id: params?.[0] as string, mentions: ["autonomous"], has_agent: true })],
          rowCount: 1,
        })
      return Promise.resolve({ rows: [], rowCount: 0 })
    })
    const res = await POST(post({ body: "Tolong [@Geno](#agent:autonomous) cek" }), {
      params: Promise.resolve({ id: "space-1" }),
    })
    expect(res.status).toBe(201)
    const j = await res.json()
    expect(j.tasks).toHaveLength(1)
    expect(j.tasks[0]).toMatchObject({ agentType: "autonomous", status: "todo" })
  })

  it("auto-runs enqueued tasks fire-and-forget for user senders", async () => {
    authMock.mockReturnValue({
      user: { user_id: "u1", email: "s@x.id", account_type: "member" },
      token: "jwt-1",
    })
    const taskRow = {
      id: "task-auto",
      space_id: "space-1",
      thread_root: "m-root",
      trigger_msg: "m-new",
      agent_type: "autonomous",
      instruction: "Halo @Geno",
      status: "todo",
      reason: "mention",
      result_msg: null,
      approval_ref: {},
      created_by: "user:u1",
      created_at: "2026-09-17T10:00:00.000Z",
      updated_at: "2026-09-17T10:00:00.000Z",
    }
    const agentMsgRow = {
      ...msgRow({ id: "m-agent" }),
      author_kind: "agent",
      author_id: "autonomous",
      author_name: "Geno",
      agent_type: "autonomous",
      body: "Siap.",
    }
    queryMock.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes("FROM dashboard.workspace_agent_tasks") && sql.includes("WHERE id ="))
        return Promise.resolve({ rows: [{ ...taskRow, status: "todo" }] })
      if (sql.includes("FROM dashboard.workspace_agent_tasks"))
        return Promise.resolve({ rows: [] })
      if (sql.includes("INSERT INTO dashboard.workspace_agent_tasks"))
        return Promise.resolve({ rows: [taskRow], rowCount: 1 })
      if (sql.includes("INSERT INTO dashboard.workspace_messages")) {
        const authorKind = (params?.[3] as string) ?? ""
        return Promise.resolve({
          rows: [authorKind === "agent" ? agentMsgRow : msgRow({ id: params?.[0] as string })],
          rowCount: 1,
        })
      }
      return Promise.resolve({ rows: [], rowCount: 0 })
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ reply: "Siap.", pending_approval: null }) })),
    )
    const res = await POST(post({ body: "Halo @Geno" }, {}), {
      params: Promise.resolve({ id: "space-1" }),
    })
    expect(res.status).toBe(201)
    for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r))
    const agentWrite = queryMock.mock.calls.find(
      (c) =>
        String(c[0]).includes("INSERT INTO dashboard.workspace_messages") &&
        (c[1] as unknown[])[4] === "Geno",
    )
    expect(agentWrite).toBeDefined()
    vi.unstubAllGlobals()
  })

  it("reply un-archives the topic", async () => {
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes("FROM dashboard.workspace_messages"))
        return Promise.resolve({ rows: [msgRow({ id: "m1" })] })
      if (sql.includes("UPDATE dashboard.workspace_topics"))
        return Promise.resolve({ rows: [{ id: "t1" }], rowCount: 1 })
      if (sql.includes("INSERT INTO dashboard.workspace_messages"))
        return Promise.resolve({ rows: [msgRow({ id: "m2", thread_root: "m1" })], rowCount: 1 })
      return Promise.resolve({ rows: [], rowCount: 0 })
    })
    const res = await POST(post({ threadRoot: "m1", body: "Setuju" }), {
      params: Promise.resolve({ id: "space-1" }),
    })
    expect(res.status).toBe(201)
    expect((await res.json()).unarchived).toBe(true)
  })

  it("404s on unknown thread", async () => {
    queryMock.mockImplementation(() => Promise.resolve({ rows: [], rowCount: 0 }))
    const res = await POST(post({ threadRoot: "nope", body: "hi" }), {
      params: Promise.resolve({ id: "space-1" }),
    })
    expect(res.status).toBe(404)
  })

  it("400s on empty body", async () => {
    const res = await POST(post({ body: "   " }), { params: Promise.resolve({ id: "space-1" }) })
    expect(res.status).toBe(400)
  })

  it("forbids agents without a write grant", async () => {
    const res = await POST(post({ body: "hi" }, svcAgent), {
      params: Promise.resolve({ id: "space-1" }),
    })
    expect(res.status).toBe(403)
  })

  it("forbids viewers from writing", async () => {
    authMock.mockReturnValue({
      user: { user_id: "viewer-1", email: "v@x.id", account_type: "member" },
      token: "t",
    })
    // Doc owned by someone else, viewer has no ACL/member grant.
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes("FROM dashboard.workspace_docs"))
        return Promise.resolve({ rows: [{ id: "space-1", owner: "owner-1", workspace_id: "ws-1" }] })
      return Promise.resolve({ rows: [], rowCount: 0 })
    })
    const res = await POST(post({ body: "hi" }, {}), {
      params: Promise.resolve({ id: "space-1" }),
    })
    expect(res.status).toBe(403)
  })

  it("rejects unauthenticated callers", async () => {
    const res = await POST(post({ body: "hi" }, {}), {
      params: Promise.resolve({ id: "space-1" }),
    })
    expect(res.status).toBe(401)
  })
})
