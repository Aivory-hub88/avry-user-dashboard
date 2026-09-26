/** Request attachments (ADR-019 P1): requester uploads while editable, team owner reads only. */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { queryMock, authMock, r2 } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  authMock: vi.fn<(...args: unknown[]) => unknown>(() => null),
  r2: {
    presignPut: vi.fn(async () => "https://r2.example/put"),
    presignGet: vi.fn(async () => "https://r2.example/get"),
    headObject: vi.fn(async () => null),
    deleteObject: vi.fn(async () => {}),
    r2Configured: vi.fn(() => true),
  },
}))

vi.mock("@/lib/db", () => ({ query: queryMock, withTransaction: vi.fn() }))
vi.mock("@/lib/serverAuth", () => ({ getAuthUserWithToken: () => authMock() }))
vi.mock("@/lib/r2", () => ({ ...r2, R2_TTL: { put: 300, get: 60 } }))

import { GET as LIST, POST as CREATE } from "./route"

const as = (id: string) => ({ user: { user_id: id, email: `${id}@x.id`, account_type: "member" }, token: "t" })
let status = "draft"

beforeEach(() => {
  vi.clearAllMocks()
  status = "draft"
  queryMock.mockImplementation((sql: string, params: unknown[] = []) => {
    const s = sql.replace(/\s+/g, " ").trim()
    if (s.startsWith("SELECT * FROM dashboard.project_requests"))
      return Promise.resolve({ rows: [{ id: "r1", workspace_id: "team-1", title: "T", status, requested_by: "rina", data_table: null }] })
    if (s.startsWith("SELECT owner FROM dashboard.workspaces")) return Promise.resolve({ rows: [{ owner: "boss" }] })
    if (s.startsWith("SELECT role FROM dashboard.workspace_members")) return Promise.resolve({ rows: [] })
    if (s.startsWith("INSERT INTO dashboard.workspace_files"))
      return Promise.resolve({ rows: [{ id: "f1", request_id: "r1", key: "k", name: "a.pdf", mime: "application/pdf", size: 10, status: "pending", uploaded_by: "user:rina" }] })
    if (s.includes("FROM dashboard.workspace_files")) return Promise.resolve({ rows: [] })
    void params
    return Promise.resolve({ rows: [] })
  })
})

const ctx = { params: Promise.resolve({ rid: "r1" }) }
const post = () =>
  new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify({ name: "a.pdf", mime: "application/pdf", size: 10 }) })

describe("request files", () => {
  it("requester uploads a draft attachment under a request/ key", async () => {
    authMock.mockReturnValue(as("rina"))
    const r = await CREATE(post(), ctx)
    expect(r.status).toBe(201)
    const [key] = r2.presignPut.mock.calls[0] as unknown as [string]
    expect(key).toMatch(/^ws\/team-1\/request\/r1\/[0-9a-f-]{36}\/a\.pdf$/)
  })

  it("requester can't upload once submitted", async () => {
    authMock.mockReturnValue(as("rina"))
    status = "submitted"
    expect((await CREATE(post(), ctx)).status).toBe(403)
  })

  it("team owner reads but can't upload", async () => {
    authMock.mockReturnValue(as("boss"))
    expect((await LIST(new NextRequest("http://localhost/x"), ctx)).status).toBe(200)
    expect((await CREATE(post(), ctx)).status).toBe(403)
  })

  it("anyone else gets 404", async () => {
    authMock.mockReturnValue(as("stranger"))
    expect((await LIST(new NextRequest("http://localhost/x"), ctx)).status).toBe(404)
  })
})
