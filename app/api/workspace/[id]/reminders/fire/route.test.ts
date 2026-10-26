/**
 * ADR-021 §4.1 / §4.2 routes: the backend sweeper's reminder fire, and waking a wait from outside.
 * Auth only; the reminder and wait logic is covered in lib/teamFollowup5.run.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { authMock, roleMock, fireMock, wakeMock } = vi.hoisted(() => ({
  authMock: vi.fn<(...args: unknown[]) => unknown>(() => null),
  roleMock: vi.fn(async () => "editor" as string | null),
  fireMock: vi.fn(async () => 2),
  wakeMock: vi.fn(async () => true),
}))
vi.mock("@/lib/serverAuth", () => ({ getAuthUserWithToken: () => authMock() }))
vi.mock("@/lib/workspaceAccess", () => ({
  getDocRole: roleMock,
  canWrite: (role: string | null) => role === "owner" || role === "editor",
}))
vi.mock("@/lib/teamReminders", () => ({ fireDueReminders: fireMock }))
vi.mock("@/lib/teamWaits", () => ({ requestWake: wakeMock }))

import { POST as fire } from "./route"
import { POST as wake } from "../../waits/[waitId]/wake/route"

process.env.COLLAB_SERVICE_TOKEN = "test-service-token"
const USER = { user: { user_id: "u1", email: "a@x.id", account_type: "member" }, token: "minted" }
const req = (url: string, headers: Record<string, string> = {}, body?: unknown) =>
  new NextRequest(url, { method: "POST", headers, ...(body ? { body: JSON.stringify(body) } : {}) })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  authMock.mockReset().mockReturnValue(null)
  roleMock.mockReset().mockResolvedValue("editor")
  fireMock.mockClear()
  wakeMock.mockReset().mockResolvedValue(true)
})

describe("POST /api/workspace/[id]/reminders/fire", () => {
  it("fires only the calling member's reminders", async () => {
    authMock.mockReturnValue(USER)
    const res = await fire(req("http://x/api/workspace/s1/reminders/fire"), params("s1"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ fired: 2 })
    expect(fireMock).toHaveBeenCalledWith("s1", expect.objectContaining({ kind: "user", token: "minted" }), { owner: "u1" })
  })

  it("refuses no token, the service token, and a member who cannot write", async () => {
    expect((await fire(req("http://x/a"), params("s1"))).status).toBe(401)
    expect((await fire(req("http://x/a", { "x-service-token": "test-service-token" }), params("s1"))).status).toBe(403)
    authMock.mockReturnValue(USER)
    roleMock.mockResolvedValue("viewer")
    expect((await fire(req("http://x/a"), params("s1"))).status).toBe(403)
    expect(fireMock).not.toHaveBeenCalled()
  })
})

describe("POST /api/workspace/[id]/waits/[waitId]/wake", () => {
  const wakeParams = (waitId: string) => ({ params: Promise.resolve({ id: "s1", waitId }) })

  it("a webhook with the service token files the wake for the sweeper", async () => {
    const res = await wake(
      req("http://x/a", { "x-service-token": "test-service-token", "content-type": "application/json" }, { reason: "build 412 passed" }),
      wakeParams("w_1"),
    )
    expect(res.status).toBe(202)
    expect(wakeMock).toHaveBeenCalledWith("s1", "w_1", "build 412 passed")
    expect(fireMock).not.toHaveBeenCalled()
  })

  it("a member's wake also fires it right away", async () => {
    authMock.mockReturnValue(USER)
    expect((await wake(req("http://x/a"), wakeParams("w_1"))).status).toBe(202)
    expect(fireMock).toHaveBeenCalledWith("s1", expect.objectContaining({ kind: "user" }))
  })

  it("refuses strangers, readers, bad ids and closed waits", async () => {
    expect((await wake(req("http://x/a"), wakeParams("w_1"))).status).toBe(401)
    authMock.mockReturnValue(USER)
    roleMock.mockResolvedValue("viewer")
    expect((await wake(req("http://x/a"), wakeParams("w_1"))).status).toBe(403)
    roleMock.mockResolvedValue("editor")
    expect((await wake(req("http://x/a"), wakeParams("../x"))).status).toBe(404)
    wakeMock.mockResolvedValue(false)
    expect((await wake(req("http://x/a"), wakeParams("w_gone"))).status).toBe(404)
  })
})
