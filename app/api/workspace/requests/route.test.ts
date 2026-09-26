/**
 * Project requests (ADR-019 P1): team gating, requester/reviewer split,
 * status transitions, and approval creating a room in one transaction.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { queryMock, authMock, saveDbDocMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  authMock: vi.fn<(...args: unknown[]) => unknown>(() => null),
  saveDbDocMock: vi.fn(async () => {}),
}))

vi.mock("@/lib/db", () => ({
  query: queryMock,
  withTransaction: (fn: (tx: typeof queryMock) => unknown) => fn(queryMock),
}))
vi.mock("@/lib/serverAuth", () => ({ getAuthUserWithToken: () => authMock() }))
vi.mock("@/lib/workspaceDb", async (orig) => ({ ...(await orig<object>()), saveDbDoc: saveDbDocMock }))
vi.mock("@/lib/workspaceActivity", () => ({ recordWorkspaceActivity: vi.fn(async () => {}) }))

import { POST as CREATE, GET as LIST } from "./route"
import { GET as READ, PATCH } from "./[rid]/route"
import { POST as SUBMIT } from "./[rid]/submit/route"
import { POST as REVIEW } from "./[rid]/review/route"
import { POST as ADD_MEMBER } from "../../workspaces/[id]/members/route"

const as = (id: string, account_type = "member") => ({ user: { user_id: id, email: `${id}@x.id`, account_type }, token: `jwt-${id}` })

type Row = Record<string, unknown>
let request: Row
let members: { user_id: string; role: string }[]
let calls: string[]
let claimed: boolean

const baseRequest = (over: Row = {}): Row => ({
  id: "r1",
  workspace_id: "team-1",
  title: "Odoo rollout",
  goal: "Move CRM to Odoo",
  deadline: null,
  priority: "High",
  status: "draft",
  requested_by: "rina",
  requested_by_name: "rina@x.id",
  fields: [],
  data_table: { columns: [], rows: [] },
  members: [],
  agents: [],
  created_at: "2026-09-26T10:00:00Z",
  updated_at: "2026-09-26T10:00:00Z",
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  request = baseRequest()
  // team-1: owner "boss" (workspaces.owner), rina = editor, vic = viewer
  members = [
    { user_id: "rina", role: "editor" },
    { user_id: "vic", role: "viewer" },
  ]
  calls = []
  claimed = false
  queryMock.mockImplementation((sql: string, params: unknown[] = []) => {
    const s = sql.replace(/\s+/g, " ").trim()
    calls.push(s)
    if (s.startsWith("SELECT owner FROM dashboard.workspaces"))
      return Promise.resolve({ rows: params[0] === "team-1" ? [{ owner: "boss" }] : [] })
    if (s.startsWith("SELECT name FROM dashboard.workspaces")) return Promise.resolve({ rows: [{ name: "Acme" }] })
    if (s.startsWith("SELECT role FROM dashboard.workspace_members")) {
      const m = members.find((x) => x.user_id === params[1])
      return Promise.resolve({ rows: m ? [{ role: m.role }] : [] })
    }
    if (s.startsWith("SELECT * FROM dashboard.project_requests WHERE id"))
      return Promise.resolve({ rows: params[0] === "r1" ? [request] : [] })
    if (s.startsWith("INSERT INTO dashboard.project_requests"))
      return Promise.resolve({ rows: [baseRequest({ id: params[0], workspace_id: params[1], title: params[2] })] })
    if (s.startsWith("UPDATE dashboard.project_requests SET status = 'approved'")) {
      if (claimed || request.status !== "submitted") return Promise.resolve({ rows: [], rowCount: 0 })
      claimed = true
      request = { ...request, status: "approved", room_id: params[3] }
      return Promise.resolve({ rows: [{ id: "r1" }], rowCount: 1 })
    }
    if (s.startsWith("UPDATE dashboard.project_requests SET status = 'submitted'")) {
      if (!["draft", "changes_requested"].includes(String(request.status))) return Promise.resolve({ rows: [] })
      request = { ...request, status: "submitted" }
      return Promise.resolve({ rows: [request] })
    }
    if (s.startsWith("UPDATE dashboard.project_requests SET status = $2")) {
      request = { ...request, status: params[1], review_note: params[3] }
      return Promise.resolve({ rows: [request] })
    }
    if (s.startsWith("SELECT id, lower(email) AS email FROM identity.users"))
      return Promise.resolve({ rows: [{ id: "dewi", email: "dewi@x.id" }] })
    return Promise.resolve({ rows: [], rowCount: 1 })
  })
})

const req = (body?: unknown) =>
  new NextRequest("http://localhost/api/workspace/requests", {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const rctx = { params: Promise.resolve({ rid: "r1" }) }

describe("create", () => {
  it("401 without a session", async () => {
    authMock.mockReturnValue(null)
    expect((await CREATE(req({ workspaceId: "team-1" }))).status).toBe(401)
  })

  it("400 for the shared default workspace", async () => {
    authMock.mockReturnValue(as("rina"))
    expect((await CREATE(req({ workspaceId: "default" }))).status).toBe(400)
  })

  it("403 for a viewer and for an outsider", async () => {
    authMock.mockReturnValue(as("vic"))
    expect((await CREATE(req({ workspaceId: "team-1" }))).status).toBe(403)
    authMock.mockReturnValue(as("stranger"))
    expect((await CREATE(req({ workspaceId: "team-1" }))).status).toBe(403)
  })

  it("201 draft for a team editor", async () => {
    authMock.mockReturnValue(as("rina"))
    const r = await CREATE(req({ workspaceId: "team-1", title: "Odoo rollout" }))
    expect(r.status).toBe(201)
    expect((await r.json()).request).toMatchObject({ workspaceId: "team-1", title: "Odoo rollout", status: "draft" })
  })

  it("inbox lists only for team owners (SQL scoped to the caller)", async () => {
    authMock.mockReturnValue(as("boss"))
    const r = await LIST(new NextRequest("http://localhost/api/workspace/requests?scope=inbox"))
    expect(r.status).toBe(200)
    expect(calls.some((c) => c.includes("w.owner = $1") && c.includes("m.role = 'owner'"))).toBe(true)
  })
})

describe("read / edit", () => {
  it("404 (not 403) for someone who isn't requester or owner", async () => {
    authMock.mockReturnValue(as("vic"))
    expect((await READ(req(), rctx)).status).toBe(404)
  })

  it("owner can read and sees review only once submitted", async () => {
    authMock.mockReturnValue(as("boss"))
    let j = await (await READ(req(), rctx)).json()
    expect(j.can).toEqual({ edit: false, submit: false, withdraw: false, review: false })
    request.status = "submitted"
    j = await (await READ(req(), rctx)).json()
    expect(j.can.review).toBe(true)
  })

  it("only the requester edits, and only while editable", async () => {
    authMock.mockReturnValue(as("boss"))
    expect((await PATCH(req({ goal: "x" }), rctx)).status).toBe(403)
    authMock.mockReturnValue(as("rina"))
    request.status = "submitted"
    expect((await PATCH(req({ goal: "x" }), rctx)).status).toBe(409)
  })
})

describe("submit", () => {
  it("400 with problems when the goal is missing", async () => {
    authMock.mockReturnValue(as("rina"))
    request.goal = ""
    const r = await SUBMIT(req({}), rctx)
    expect(r.status).toBe(400)
    expect((await r.json()).problems).toEqual(["Describe the goal"])
  })

  it("draft → submitted", async () => {
    authMock.mockReturnValue(as("rina"))
    const r = await SUBMIT(req({}), rctx)
    expect(r.status).toBe(200)
    expect((await r.json()).request.status).toBe("submitted")
  })
})

describe("review", () => {
  beforeEach(() => {
    request = baseRequest({
      status: "submitted",
      members: [{ email: "dewi@x.id", role: "viewer" }, { email: "ghost@x.id", role: "editor" }],
      agents: ["generalist"],
      data_table: { columns: ["Customer", "City"], rows: [["Acme", "Jakarta"], ["Beta", "Bali"]] },
    })
  })

  it("403 for the requester (not an owner)", async () => {
    authMock.mockReturnValue(as("rina"))
    expect((await REVIEW(req({ decision: "approve" }), rctx)).status).toBe(403)
  })

  it("changes and reject need a note", async () => {
    authMock.mockReturnValue(as("boss"))
    expect((await REVIEW(req({ decision: "changes" }), rctx)).status).toBe(400)
    const r = await REVIEW(req({ decision: "changes", note: "Add a budget" }), rctx)
    expect(r.status).toBe(200)
    expect((await r.json()).request.status).toBe("changes_requested")
  })

  it("approve creates the room, moves files, grants people and agents, seeds the table", async () => {
    authMock.mockReturnValue(as("boss"))
    const r = await REVIEW(req({ decision: "approve" }), rctx)
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.roomId).toMatch(/^[0-9a-f-]{36}$/)
    expect(j.notFound).toEqual(["ghost@x.id"])
    expect(j.seededRows).toBe(2)

    const docInserts = calls.filter((c) => c.startsWith("INSERT INTO dashboard.workspace_docs"))
    expect(docInserts).toHaveLength(2)
    expect(calls.some((c) => c.startsWith("UPDATE dashboard.workspace_files SET room_id"))).toBe(true)
    expect(calls.some((c) => c.startsWith("INSERT INTO dashboard.workspace_doc_acl"))).toBe(true)
    expect(calls.some((c) => c.startsWith("INSERT INTO dashboard.workspace_agent_acl"))).toBe(true)
    expect(saveDbDocMock).toHaveBeenCalledTimes(1)
    const [roomId, , cred] = saveDbDocMock.mock.calls[0] as unknown as [string, unknown, { kind: string }]
    expect(roomId).toBe(j.roomId)
    expect(cred.kind).toBe("service")
  })

  it("a second approval gets 409 and creates nothing", async () => {
    authMock.mockReturnValue(as("boss"))
    await REVIEW(req({ decision: "approve" }), rctx)
    request.status = "submitted" // simulate a stale read racing the first approval
    const before = calls.length
    const r = await REVIEW(req({ decision: "approve" }), rctx)
    expect(r.status).toBe(409)
    expect(calls.slice(before).some((c) => c.startsWith("INSERT INTO dashboard.workspace_docs"))).toBe(false)
  })
})

describe("team membership guard", () => {
  it("the shared default workspace refuses members, even from a platform admin", async () => {
    authMock.mockReturnValue(as("admin1", "superadmin"))
    const r = await ADD_MEMBER(req({ email: "a@x.id" }), { params: Promise.resolve({ id: "default" }) })
    expect(r.status).toBe(400)
  })
})
