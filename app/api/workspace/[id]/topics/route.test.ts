/**
 * POST /topics + PATCH /topics/[t] (Phase 2): title/archive/remove/attach.
 * remove-topic keeps messages (hanya baris topic yang dihapus).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))

vi.mock("@/lib/db", () => ({ query: queryMock }))
vi.mock("@/lib/serverAuth", () => ({ getAuthUserWithToken: () => null }))

import { POST } from "./route"
import { PATCH } from "./[t]/route"

process.env.COLLAB_SERVICE_TOKEN = "test-service-token"

const svc = { "x-service-token": "test-service-token" }

const TOPIC_ROW = {
  id: "t1",
  thread_root: "m1",
  title: "Decide: launch cut",
  archived: false,
  doc_id: null,
  created_by: "system:service",
  created_at: "2026-09-17T10:01:00.000Z",
}

const ROOT_ROW = {
  id: "m1",
  space_id: "space-1",
  thread_root: null,
  author_kind: "system",
  author_id: "service",
  author_name: "service",
  agent_type: null,
  body: "Launch?",
  mentions: [],
  member_ids: [],
  here: false,
  has_agent: false,
  doc_refs: [],
  created_at: "2026-09-17T10:00:00.000Z",
  edited_at: null,
  deleted_at: null,
}

function postTopics(body: unknown) {
  return new NextRequest("http://localhost/api/workspace/space-1/topics", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...svc },
    body: JSON.stringify(body),
  })
}

function patchTopic(t: string, body: unknown) {
  return new NextRequest(`http://localhost/api/workspace/space-1/topics/${t}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...svc },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  queryMock.mockReset()
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes("INSERT INTO dashboard.workspace_topics"))
      return Promise.resolve({ rows: [TOPIC_ROW], rowCount: 1 })
    if (sql.includes("FROM dashboard.workspace_topics") && sql.includes("JOIN"))
      return Promise.resolve({ rows: [TOPIC_ROW] })
    if (sql.includes("FROM dashboard.workspace_topics"))
      return Promise.resolve({ rows: [] })
    if (sql.includes("FROM dashboard.workspace_messages"))
      return Promise.resolve({ rows: [ROOT_ROW] })
    if (sql.includes("UPDATE dashboard.workspace_topics"))
      return Promise.resolve({ rows: [{ ...TOPIC_ROW, archived: true }], rowCount: 1 })
    return Promise.resolve({ rows: [], rowCount: 0 })
  })
})

describe("POST /api/workspace/[id]/topics", () => {
  it("titles an existing thread (201)", async () => {
    const res = await POST(postTopics({ rootMessageId: "m1", title: "Decide: launch cut" }), {
      params: Promise.resolve({ id: "space-1" }),
    })
    expect(res.status).toBe(201)
    expect((await res.json()).topic.title).toBe("Decide: launch cut")
  })

  it("409s when the thread already has a topic", async () => {
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes("FROM dashboard.workspace_messages"))
        return Promise.resolve({ rows: [ROOT_ROW] })
      if (sql.includes("FROM dashboard.workspace_topics"))
        return Promise.resolve({ rows: [TOPIC_ROW] })
      return Promise.resolve({ rows: [], rowCount: 0 })
    })
    const res = await POST(postTopics({ rootMessageId: "m1", title: "Lain" }), {
      params: Promise.resolve({ id: "space-1" }),
    })
    expect(res.status).toBe(409)
  })

  it("creates thread + root when rootMessageId absent", async () => {
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO dashboard.workspace_messages"))
        return Promise.resolve({ rows: [ROOT_ROW], rowCount: 1 })
      if (sql.includes("INSERT INTO dashboard.workspace_topics"))
        return Promise.resolve({ rows: [TOPIC_ROW], rowCount: 1 })
      return Promise.resolve({ rows: [], rowCount: 0 })
    })
    const res = await POST(postTopics({ title: "Goal baru", body: "Isi awal" }), {
      params: Promise.resolve({ id: "space-1" }),
    })
    expect(res.status).toBe(201)
    const j = await res.json()
    expect(j.root).toBeDefined()
    expect(j.topic).toBeDefined()
  })
})

describe("PATCH /api/workspace/[id]/topics/[t]", () => {
  const params = { params: Promise.resolve({ id: "space-1", t: "t1" }) }

  it("archives", async () => {
    const res = await PATCH(patchTopic("t1", { op: "archive" }), params)
    expect(res.status).toBe(200)
    const update = queryMock.mock.calls.find((c) => String(c[0]).includes("UPDATE dashboard.workspace_topics"))
    expect((update![1] as unknown[])[0]).toBe(true)
  })

  it("remove deletes only the topic row — messages untouched", async () => {
    const res = await PATCH(patchTopic("t1", { op: "remove" }), params)
    expect(res.status).toBe(200)
    const deletes = queryMock.mock.calls.filter((c) => String(c[0]).includes("DELETE FROM"))
    expect(deletes).toHaveLength(1)
    expect(String(deletes[0][0])).toContain("workspace_topics")
  })

  it("rejects invalid ops", async () => {
    const res = await PATCH(patchTopic("t1", { op: "explode" }), params)
    expect(res.status).toBe(400)
  })

  it("404s on foreign topics", async () => {
    queryMock.mockImplementation(() => Promise.resolve({ rows: [], rowCount: 0 }))
    const res = await PATCH(patchTopic("t1", { op: "archive" }), params)
    expect(res.status).toBe(404)
  })
})
