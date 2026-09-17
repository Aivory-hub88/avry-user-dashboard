/**
 * Agent task routes (Phase 3): list + run (reply/blocked) + cancel.
 * Backend agent-chat di-mock via global fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
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

import { GET } from "./route"
import { POST, PATCH } from "./[task]/route"

process.env.COLLAB_SERVICE_TOKEN = "test-service-token"
process.env.NEXT_PUBLIC_BACKEND_URL = "https://backend.test"

const svc = { "x-service-token": "test-service-token" }
const USER = { user: { user_id: "u1", email: "sarah@x.id", account_type: "member" }, token: "jwt-1" }

const TASK_ROW = {
  id: "task-1",
  space_id: "space-1",
  thread_root: "m1",
  trigger_msg: "m0",
  agent_type: "autonomous",
  instruction: "Tolong @Geno cek",
  status: "todo",
  reason: "mention",
  result_msg: null,
  approval_ref: {},
  created_by: "user:u1",
  created_at: "2026-09-17T10:00:00.000Z",
  updated_at: "2026-09-17T10:00:00.000Z",
}

const MSG_ROW = {
  id: "m-reply",
  space_id: "space-1",
  thread_root: "m1",
  author_kind: "agent",
  author_id: "autonomous",
  author_name: "Geno",
  agent_type: "autonomous",
  body: "Siap, dikerjakan.",
  mentions: [],
  member_ids: [],
  here: false,
  has_agent: false,
  doc_refs: [],
  created_at: "2026-09-17T10:05:00.000Z",
  edited_at: null,
  deleted_at: null,
}

function req(method: string, url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

beforeEach(() => {
  queryMock.mockReset()
  authMock.mockReset()
  authMock.mockReturnValue(USER)
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes("FROM dashboard.workspace_agent_tasks") && sql.includes("WHERE id ="))
      return Promise.resolve({ rows: [TASK_ROW] })
    if (sql.includes("FROM dashboard.workspace_agent_tasks"))
      return Promise.resolve({ rows: [TASK_ROW] })
    if (sql.includes("INSERT INTO dashboard.workspace_messages"))
      return Promise.resolve({ rows: [MSG_ROW], rowCount: 1 })
    return Promise.resolve({ rows: [], rowCount: 0 })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("GET /api/workspace/[id]/agent-tasks", () => {
  it("lists thread tasks", async () => {
    const res = await GET(
      req("GET", "http://localhost/api/workspace/space-1/agent-tasks?thread=m1", undefined),
      { params: Promise.resolve({ id: "space-1" }) },
    )
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.tasks).toHaveLength(1)
    expect(j.tasks[0]).toMatchObject({ agentType: "autonomous", status: "todo" })
  })

  it("401s without credentials", async () => {
    authMock.mockReturnValue(null)
    const res = await GET(req("GET", "http://localhost/api/workspace/space-1/agent-tasks", undefined), {
      params: Promise.resolve({ id: "space-1" }),
    })
    expect(res.status).toBe(401)
  })
})

describe("POST /api/workspace/[id]/agent-tasks/[task]/run", () => {
  const params = { params: Promise.resolve({ id: "space-1", task: "task-1" }) }

  it("writes the agent reply back + marks done", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ reply: "Siap, dikerjakan.", pending_approval: null }) })),
    )
    const res = await POST(req("POST", "http://localhost/x", {}), params)
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.message.body).toBe("Siap, dikerjakan.")
    expect(j.message.author.agentType).toBe("autonomous")
    const insert = queryMock.mock.calls.find((c) => String(c[0]).includes("INSERT INTO dashboard.workspace_messages"))
    expect(insert).toBeDefined()
    const done = queryMock.mock.calls.find(
      (c) => String(c[0]).includes("UPDATE dashboard.workspace_agent_tasks") && (c[1] as unknown[])[1] === "done",
    )
    expect(done).toBeDefined()
  })

  it("parks on pending approval with ZERO writes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          reply: "",
          pending_approval: { id: "ap-1", tool_name: "db.transact", risk_tier: "high" },
        }),
      })),
    )
    const res = await POST(req("POST", "http://localhost/x", {}), params)
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.pendingApproval).toMatchObject({ id: "ap-1" })
    expect(j.message).toBeUndefined()
    const inserts = queryMock.mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO dashboard.workspace_messages"),
    )
    expect(inserts).toHaveLength(0)
    const blocked = queryMock.mock.calls.find(
      (c) => String(c[0]).includes("UPDATE dashboard.workspace_agent_tasks") && (c[1] as unknown[])[1] === "blocked",
    )
    expect(blocked).toBeDefined()
  })

  it("502s + marks failed when the agent is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })))
    const res = await POST(req("POST", "http://localhost/x", {}), params)
    expect(res.status).toBe(502)
    const failed = queryMock.mock.calls.find(
      (c) => String(c[0]).includes("UPDATE dashboard.workspace_agent_tasks") && (c[1] as unknown[])[1] === "failed",
    )
    expect(failed).toBeDefined()
  })

  it("forbids service credentials (agents don't trigger agents)", async () => {
    const res = await POST(req("POST", "http://localhost/x", {}, svc), params)
    expect(res.status).toBe(403)
  })

  it("409s on already-done tasks", async () => {
    queryMock.mockImplementation((sql: string) =>
      sql.includes("WHERE id =")
        ? Promise.resolve({ rows: [{ ...TASK_ROW, status: "done" }] })
        : Promise.resolve({ rows: [], rowCount: 0 }),
    )
    const res = await POST(req("POST", "http://localhost/x", {}), params)
    expect(res.status).toBe(409)
  })
})

describe("PATCH /api/workspace/[id]/agent-tasks/[task]", () => {
  const params = { params: Promise.resolve({ id: "space-1", task: "task-1" }) }

  it("cancels open tasks (Deny path)", async () => {
    const res = await PATCH(req("PATCH", "http://localhost/x", { op: "cancel" }), params)
    expect(res.status).toBe(200)
    const cancelled = queryMock.mock.calls.find(
      (c) => String(c[0]).includes("UPDATE dashboard.workspace_agent_tasks") && (c[1] as unknown[])[1] === "cancelled",
    )
    expect(cancelled).toBeDefined()
  })
})
