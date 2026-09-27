import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import type { NextRequest } from "next/server"
import jwt from "jsonwebtoken"
import { syncAccessTokenCookies, ACCESS_COOKIE, SESSION_COOKIE } from "@/lib/accessCookies"
import { getAuthUser } from "@/lib/serverAuth"

/** A minimal browser cookie jar: `document.cookie =` sets/deletes one cookie,
 *  reading returns "a=1; b=2" like a browser. Records every write. */
function stubCookieJar(initial: Record<string, string> = {}) {
  const jar = new Map(Object.entries(initial))
  const writes: string[] = []
  ;(globalThis as any).document = {
    get cookie() {
      return [...jar].map(([k, v]) => `${k}=${v}`).join("; ")
    },
    set cookie(line: string) {
      writes.push(line)
      const [pair, ...attrs] = line.split(";").map((s) => s.trim())
      const eq = pair.indexOf("=")
      const name = pair.slice(0, eq)
      const expired = attrs.some((a) => a.toLowerCase() === "max-age=0")
      if (expired) jar.delete(name)
      else jar.set(name, pair.slice(eq + 1))
    },
  }
  return { jar, writes }
}

function stubLocalStorage(initial: Record<string, string> = {}) {
  const ls = new Map(Object.entries(initial))
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => ls.get(k) ?? null,
    setItem: (k: string, v: string) => void ls.set(k, String(v)),
    removeItem: (k: string) => void ls.delete(k),
  }
  return ls
}

const SECRET = "test-secret"
const sign = (userId: string, expiresIn: number) =>
  jwt.sign({ user_id: userId, type: "access" }, SECRET, { algorithm: "HS256", expiresIn })

afterEach(() => {
  delete (globalThis as any).document
  delete (globalThis as any).localStorage
  delete (globalThis as any).window
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe("syncAccessTokenCookies", () => {
  it("overwrites both cookies with the landing's attributes", () => {
    const { jar, writes } = stubCookieJar({ [ACCESS_COOKIE]: "old", [SESSION_COOKIE]: "%22old%22" })
    syncAccessTokenCookies("new.jwt.value")
    expect(jar.get(ACCESS_COOKIE)).toBe("new.jwt.value")
    expect(JSON.parse(decodeURIComponent(jar.get(SESSION_COOKIE)!))).toBe("new.jwt.value")
    for (const w of writes) expect(w).toMatch(/; path=\/; max-age=604800; SameSite=Lax$/)
    // Host-only, like setAuthCookies: a domain= variant would be a second cookie.
    for (const w of writes) expect(w).not.toMatch(/domain=/i)
  })

  it("updates when only the session cookie is present", () => {
    const { jar } = stubCookieJar({ [SESSION_COOKIE]: "%22old%22" })
    syncAccessTokenCookies("new")
    expect(jar.get(ACCESS_COOKIE)).toBe("new")
  })

  it("does not create cookies for a session that never had them", () => {
    const { writes } = stubCookieJar({ other: "x" })
    syncAccessTokenCookies("new")
    expect(writes).toEqual([])
  })

  it("ignores an empty token", () => {
    const { writes } = stubCookieJar({ [ACCESS_COOKIE]: "old" })
    syncAccessTokenCookies("")
    expect(writes).toEqual([])
  })
})

describe("refresh in authedFetch keeps the cookie current", () => {
  beforeEach(() => {
    ;(globalThis as any).window = {} // no global AuthManager script
  })

  it("replaces the stale cookie so server routes and the next request see the new token", async () => {
    const stale = sign("u1", -60) // already expired
    const fresh = sign("u1", 3600)
    const { jar } = stubCookieJar({
      [ACCESS_COOKIE]: stale,
      [SESSION_COOKIE]: encodeURIComponent(JSON.stringify(stale)),
    })
    const ls = stubLocalStorage({
      aivory_auth: JSON.stringify({ access_token: stale, refresh_token: "r1" }),
    })

    const seen: (string | null)[] = []
    const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.endsWith("/api/v1/auth/refresh")) {
        return new Response(JSON.stringify({ access_token: fresh }), { status: 200 })
      }
      const auth = (init.headers as Record<string, string>)?.Authorization ?? null
      seen.push(auth)
      return new Response("{}", { status: auth === `Bearer ${fresh}` ? 200 : 401 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const { authedFetch } = await import("@/lib/deployAuth")

    expect((await authedFetch("/api/x")).status).toBe(200)
    expect(jar.get(ACCESS_COOKIE)).toBe(fresh)
    expect(JSON.parse(decodeURIComponent(jar.get(SESSION_COOKIE)!))).toBe(fresh)
    expect(JSON.parse(ls.get("aivory_auth")!).access_token).toBe(fresh)

    // Second call goes straight out with the fresh token: no 401, no refresh.
    fetchMock.mockClear()
    expect((await authedFetch("/api/y")).status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(seen.at(-1)).toBe(`Bearer ${fresh}`)

    // A server route reading only the cookie now authenticates.
    vi.stubEnv("JWT_SECRET", SECRET)
    const req = (cookie: string) =>
      ({
        headers: new Headers(),
        cookies: { get: (n: string) => (n === ACCESS_COOKIE ? { value: cookie } : undefined) },
      }) as unknown as NextRequest
    expect(getAuthUser(req(stale))).toBeNull()
    expect(getAuthUser(req(jar.get(ACCESS_COOKIE)!))?.user_id).toBe("u1")
  })
})

describe("logout clears what server routes read", () => {
  function stubWindow() {
    const events: string[] = []
    ;(globalThis as any).window = {
      location: { href: "" },
      dispatchEvent: (e: Event) => void events.push(e.type),
    }
    ;(globalThis as any).sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    return events
  }

  function lsWithKeys(initial: Record<string, string>) {
    const ls = stubLocalStorage(initial)
    ;(globalThis as any).localStorage.key = (i: number) => [...ls.keys()][i] ?? null
    Object.defineProperty((globalThis as any).localStorage, "length", { get: () => ls.size })
    return ls
  }

  afterEach(() => {
    delete (globalThis as any).sessionStorage
  })

  it("clearAuthCookies expires every auth cookie in every scope", async () => {
    const { jar, writes } = stubCookieJar({ [ACCESS_COOKIE]: "t", [SESSION_COOKIE]: "%22t%22", aivory_user: "u", other: "keep" })
    const { clearAuthCookies } = await import("@/lib/accessCookies")
    clearAuthCookies()
    expect([...jar.keys()]).toEqual(["other"])
    for (const scope of ["", "domain=.aivory.id", "domain=.aivory.uk"]) {
      expect(writes.some((w) => w.startsWith(`${ACCESS_COOKIE}=;`) && w.includes(scope) && w.includes("max-age=0"))).toBe(true)
    }
  })

  it("manual logout revokes the server session and removes cookies and legacy tokens", async () => {
    stubWindow()
    const { jar } = stubCookieJar({ [ACCESS_COOKIE]: "t", [SESSION_COOKIE]: "%22t%22" })
    const ls = lsWithKeys({
      aivory_auth: JSON.stringify({ access_token: "t", refresh_token: "r1" }),
      auth_token: "t",
      user_id: "u1",
    })
    const fetchMock = vi.fn(async () => new Response("{}"))
    vi.stubGlobal("fetch", fetchMock)

    const { logout } = await import("@/lib/auth")
    logout()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/v1\/auth\/logout$/)
    expect(JSON.parse(init.body as string)).toEqual({ refresh_token: "r1" })
    expect(init.keepalive).toBe(true)
    expect(jar.has(ACCESS_COOKIE)).toBe(false)
    expect(jar.has(SESSION_COOKIE)).toBe(false)
    expect(ls.has("aivory_auth")).toBe(false)
    expect(ls.has("auth_token")).toBe(false)
    expect(ls.has("user_id")).toBe(false)
  })

  it("expired logout clears cookies but doesn't call the backend", async () => {
    stubWindow()
    const { jar } = stubCookieJar({ [ACCESS_COOKIE]: "t" })
    lsWithKeys({ aivory_auth: JSON.stringify({ refresh_token: "r1" }) })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const { logout } = await import("@/lib/auth")
    logout("expired")

    expect(fetchMock).not.toHaveBeenCalled()
    expect(jar.has(ACCESS_COOKIE)).toBe(false)
  })
})
