import { describe, it, expect, beforeEach } from "vitest"
import {
  logout,
  readSessionEndReason,
  SESSION_EXPIRED_EVENT,
} from "@/lib/auth"
import { resolveDashboardDecision } from "@/hooks/useDashboardAccess"

function stubBrowser() {
  const ls = new Map<string, string>()
  const ss = new Map<string, string>()
  const dispatched: string[] = []
  ;(globalThis as any).window = {
    location: { href: "" },
    dispatchEvent: (e: Event) => void dispatched.push(e.type),
  }
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => ls.get(k) ?? null,
    setItem: (k: string, v: string) => void ls.set(k, String(v)),
    removeItem: (k: string) => void ls.delete(k),
    clear: () => ls.clear(),
    key: (i: number) => [...ls.keys()][i] ?? null,
    get length() { return ls.size },
  }
  ;(globalThis as any).sessionStorage = {
    getItem: (k: string) => ss.get(k) ?? null,
    setItem: (k: string, v: string) => void ss.set(k, String(v)),
    removeItem: (k: string) => void ss.delete(k),
  }
  return { dispatched }
}

beforeEach(() => {
  stubBrowser()
})

describe("logout reasons", () => {
  it("manual logout navigates away with no expired flag", () => {
    logout()
    expect(window.location.href).toBe("/")
    expect(readSessionEndReason()).toBeNull()
  })

  it("expired logout fires the event, keeps the page, and leaves a reason", () => {
    const { dispatched } = stubBrowser()
    // Re-stub after helper reset to capture this call's events.
    logout("expired")
    expect(dispatched).toContain(SESSION_EXPIRED_EVENT)
    expect(window.location.href).toBe("")
    expect(readSessionEndReason()).toBe("expired")
  })

  it("preserves per-user chat history on expired logout", () => {
    localStorage.setItem("aivory_chat_sessions__u_user_1", `["t"]`)
    localStorage.setItem("aivory_auth", `{"x":1}`)
    logout("expired")
    expect(localStorage.getItem("aivory_chat_sessions__u_user_1")).toBe(`["t"]`)
    expect(localStorage.getItem("aivory_auth")).toBeNull()
  })
})

describe("resolveDashboardDecision", () => {
  it("denies unauthenticated visitors toward sign-in", () => {
    const d = resolveDashboardDecision({
      hasSuperAdminCode: false,
      isAuthenticated: false,
      isSuperAdminAccount: false,
      tier: null,
    })
    expect(d.status).toBe("denied")
    expect(d.redirect).toBe("sign-in")
  })
})
