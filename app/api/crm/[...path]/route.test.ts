import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn<(...args: unknown[]) => unknown>(() => null) }))
vi.mock("@/lib/serverAuth", () => ({ getAuthUser: () => authMock() }))

import { GET, POST, PATCH } from "./route"
import { isAllowedCrmPath } from "@/lib/crmPaths"

const ID = "6b7d1f0e-3c1a-4c53-9a58-0d2f0e5a1b11"
const fetchMock = vi.fn()
vi.stubGlobal("fetch", fetchMock)

function call(handler: typeof GET, method: string, path: string[], init: { body?: string; headers?: Record<string, string> } = {}) {
  const req = new NextRequest(`http://localhost/api/crm/${path.join("/")}`, { method, ...init })
  return handler(req, { params: Promise.resolve({ path }) })
}

beforeEach(() => {
  fetchMock.mockReset()
  authMock.mockReturnValue({ user_id: "user-1" })
  process.env.CRM_SERVICE_TOKEN = "svc-token-1234567890"
  process.env.CRM_URL = "http://crm.test:8091"
})

describe("isAllowedCrmPath", () => {
  it("allows the CRM resources and rejects everything else", () => {
    expect(isAllowedCrmPath(["companies"], "GET")).toBe(true)
    expect(isAllowedCrmPath(["deals", ID, "stage"], "PATCH")).toBe(true)
    expect(isAllowedCrmPath(["health"], "GET")).toBe(false)
    expect(isAllowedCrmPath(["companies", "..", "x"], "GET")).toBe(false)
    expect(isAllowedCrmPath(["companies", "not-a-uuid"], "GET")).toBe(false)
    expect(isAllowedCrmPath(["contacts", ID, "stage"], "PATCH")).toBe(false)
    expect(isAllowedCrmPath(["activities", ID], "PATCH")).toBe(true)
    expect(isAllowedCrmPath(["companies"], "DELETE")).toBe(false)
    expect(isAllowedCrmPath(["grants"], "GET")).toBe(true)
    expect(isAllowedCrmPath(["grants"], "POST")).toBe(true)
    expect(isAllowedCrmPath(["grants", ID], "DELETE")).toBe(true)
    expect(isAllowedCrmPath(["grants", ID], "GET")).toBe(false)
    expect(isAllowedCrmPath(["grants", ID], "PATCH")).toBe(false)
    expect(isAllowedCrmPath(["mcp"], "POST")).toBe(false)
  })
})

describe("/api/crm proxy", () => {
  it("401s without a session and never calls the CRM", async () => {
    authMock.mockReturnValue(null)
    const res = await call(GET, "GET", ["companies"])
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("404s for paths outside the allowlist", async () => {
    const res = await call(GET, "GET", ["health"])
    expect(res.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("uses the JWT user as tenant and ignores a client-supplied tenant header", async () => {
    fetchMock.mockResolvedValue(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }))
    const res = await call(GET, "GET", ["companies"], { headers: { "x-tenant-id": "someone-else" } })
    expect(res.status).toBe(200)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("http://crm.test:8091/companies")
    expect(init.headers["x-tenant-id"]).toBe("user-1")
    expect(init.headers["x-service-token"]).toBe("svc-token-1234567890")
  })

  it("forwards the JSON body and query string", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
    await call(POST, "POST", ["companies"], { body: JSON.stringify({ name: "Acme" }) })
    expect(fetchMock.mock.calls[0][1].body).toBe('{"name":"Acme"}')

    fetchMock.mockClear()
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
    await call(PATCH, "PATCH", ["deals", ID, "stage"], { body: '{"stage":"won"}' })
    expect(fetchMock.mock.calls[0][0]).toBe(`http://crm.test:8091/deals/${ID}/stage`)
  })

  it("passes through CRM error statuses", async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"not found"}', { status: 404 }))
    const res = await call(GET, "GET", ["companies", ID])
    expect(res.status).toBe(404)
  })

  it("maps an upstream 401 (bad service token) to 502, not the user's problem", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }))
    expect((await call(GET, "GET", ["companies"])).status).toBe(502)
  })

  it("502s when the CRM is unreachable and 503s when unconfigured", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"))
    expect((await call(GET, "GET", ["companies"])).status).toBe(502)
    delete process.env.CRM_SERVICE_TOKEN
    expect((await call(GET, "GET", ["companies"])).status).toBe(503)
  })
})
