/**
 * GET /api/workspace/[id]/members (rail MEMBERS): owner + user grants +
 * agent grants. Read gate — viewer boleh lihat daftar.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { queryMock, authMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  authMock: vi.fn<(...args: unknown[]) => unknown>(() => null),
}))

vi.mock("@/lib/db", () => ({ query: queryMock }))
vi.mock("@/lib/serverAuth", () => ({ getAuthUserWithToken: () => authMock() }))

import { GET } from "./route"

process.env.COLLAB_SERVICE_TOKEN = "test-service-token"

const svc = { "x-service-token": "test-service-token" }

beforeEach(() => {
  queryMock.mockReset()
  authMock.mockReset()
  authMock.mockReturnValue(null)
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes("FROM dashboard.workspace_docs"))
      return Promise.resolve({
        rows: [{ owner: "u-owner", owner_email: "owner@x.id", owner_name: "Owner" }],
      })
    if (sql.includes("FROM dashboard.workspace_doc_acl"))
      return Promise.resolve({
        rows: [{ user_id: "u-john", email: "john@x.id", full_name: "John", role: "editor" }],
      })
    if (sql.includes("FROM dashboard.workspace_agent_acl"))
      return Promise.resolve({ rows: [{ agent_type: "autonomous", role: "editor" }] })
    return Promise.resolve({ rows: [], rowCount: 0 })
  })
})

describe("GET /api/workspace/[id]/members", () => {
  it("returns owner + users + agents", async () => {
    const res = await GET(new NextRequest("http://localhost/api/workspace/s1/members", { headers: svc }), {
      params: Promise.resolve({ id: "s1" }),
    })
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.owner).toMatchObject({ id: "u-owner" })
    expect(j.users).toEqual([
      { id: "u-john", email: "john@x.id", name: "John", role: "editor" },
    ])
    expect(j.agents).toEqual([{ type: "autonomous", role: "editor" }])
  })

  it("401s without credentials", async () => {
    const res = await GET(new NextRequest("http://localhost/api/workspace/s1/members"), {
      params: Promise.resolve({ id: "s1" }),
    })
    expect(res.status).toBe(401)
  })
})
