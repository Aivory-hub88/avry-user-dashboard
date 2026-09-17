import { describe, it, expect, beforeEach } from "vitest"
import { currentUserId, scopedKey, claimLegacyKey } from "@/lib/userScopedStorage"
import { saveSessionMessages, loadSessionMessages, listSessions } from "@/lib/chatPersistence"

function stubStorage() {
  const store = new Map<string, string>()
  const ls = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  }
  ;(globalThis as any).window = {}
  ;(globalThis as any).localStorage = ls
  return store
}

function loginAs(userId: string) {
  localStorage.setItem("aivory_auth", JSON.stringify({ access_token: "t", user: { id: userId } }))
}

beforeEach(() => {
  stubStorage()
})

describe("userScopedStorage", () => {
  it("falls back to the bare key when logged out", () => {
    expect(currentUserId()).toBeNull()
    expect(scopedKey("aivory_chat_sessions")).toBe("aivory_chat_sessions")
  })

  it("namespaces by user id when logged in", () => {
    loginAs("user_abc")
    expect(currentUserId()).toBe("user_abc")
    expect(scopedKey("aivory_chat_sessions")).toBe("aivory_chat_sessions__u_user_abc")
  })

  it("claims a legacy global value once, then deletes the legacy slot", () => {
    localStorage.setItem("aivory_chat_sessions", `["legacy"]`)
    loginAs("user_abc")
    const key = claimLegacyKey("aivory_chat_sessions")
    expect(key).toBe("aivory_chat_sessions__u_user_abc")
    expect(localStorage.getItem(key)).toBe(`["legacy"]`)
    expect(localStorage.getItem("aivory_chat_sessions")).toBeNull()
    // Second claim is a no-op even if legacy reappears (stale write): it
    // must not overwrite the namespace.
    localStorage.setItem("aivory_chat_sessions", `["stale"]`)
    claimLegacyKey("aivory_chat_sessions")
    expect(localStorage.getItem(key)).toBe(`["legacy"]`)
  })
})

describe("chatPersistence per-user isolation", () => {
  it("keeps one account's threads invisible to another login", () => {
    loginAs("user_abc")
    saveSessionMessages("sid-1", [{ id: "m1", role: "user", content: "hello" }], null)
    expect(loadSessionMessages("sid-1")).toHaveLength(1)

    loginAs("user_xyz")
    expect(loadSessionMessages("sid-1")).toHaveLength(0)
    expect(listSessions()).toHaveLength(0)

    loginAs("user_abc")
    expect(loadSessionMessages("sid-1")).toHaveLength(1)
    expect(listSessions()).toHaveLength(1)
  })
})
