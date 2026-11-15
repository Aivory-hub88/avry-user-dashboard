import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const logout = vi.fn()
vi.mock("@/lib/auth", () => ({ logout }))

function stubLocalStorage(initial: Record<string, string> = {}) {
  const ls = new Map(Object.entries(initial))
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => ls.get(k) ?? null,
    setItem: (k: string, v: string) => void ls.set(k, String(v)),
    removeItem: (k: string) => void ls.delete(k),
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  ;(globalThis as any).window = {} // no global AuthManager script
  logout.mockClear()
})
afterEach(() => {
  delete (globalThis as any).localStorage
  delete (globalThis as any).window
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe("authedFetch and a session that can't be refreshed", () => {
  it("ends the session once when a token is rejected and there is no refresh token", async () => {
    stubLocalStorage({ aivory_auth: JSON.stringify({ access_token: "stale" }) })
    const fetchMock = vi.fn(async () => new Response("{}", { status: 401 }))
    vi.stubGlobal("fetch", fetchMock)
    const { authedFetch } = await import("@/lib/deployAuth")

    expect((await authedFetch("/api/crm/deals")).status).toBe(401)
    expect((await authedFetch("/api/workspace/rooms")).status).toBe(401)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(2) // no refresh attempt
    expect(logout).toHaveBeenCalledTimes(1)
    expect(logout).toHaveBeenCalledWith("expired")
  })

  it("leaves visitors without any token alone", async () => {
    stubLocalStorage({})
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })))
    const { authedFetch } = await import("@/lib/deployAuth")

    expect((await authedFetch("/api/crm/deals")).status).toBe(401)
    await flush()
    expect(logout).not.toHaveBeenCalled()
  })

  it("still refreshes when a refresh token exists, and ends the session only if the server rejects it", async () => {
    stubLocalStorage({ aivory_auth: JSON.stringify({ access_token: "stale", refresh_token: "r1" }) })
    // Both the API call and the refresh are rejected.
    const fetchMock = vi.fn(async (_url: string) => new Response("{}", { status: 401 }))
    vi.stubGlobal("fetch", fetchMock)
    const { authedFetch } = await import("@/lib/deployAuth")

    expect((await authedFetch("/api/crm/deals")).status).toBe(401)
    await flush()
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual(["/api/crm/deals", expect.stringMatching(/\/api\/v1\/auth\/refresh$/)])
    expect(logout).toHaveBeenCalledWith("expired")
  })
})
