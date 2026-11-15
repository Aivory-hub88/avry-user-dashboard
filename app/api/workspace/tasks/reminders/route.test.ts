import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const { runMock, authMock } = vi.hoisted(() => ({
  runMock: vi.fn(async (_now: Date, opts: { force?: boolean }) => (opts.force ? { day: "2026-11-18", sent: 1 } : { skipped: "too-early" })),
  authMock: vi.fn<(...args: unknown[]) => unknown>(() => null),
}))
vi.mock("@/lib/taskReminders", () => ({ runDueReminders: runMock }))
vi.mock("@/lib/serverAuth", () => ({ getAuthUserWithToken: () => authMock() }))

import { POST } from "./route"

process.env.COLLAB_SERVICE_TOKEN = "test-service-token"
const req = (body?: unknown, headers: Record<string, string> = { "x-service-token": "test-service-token" }) =>
  new NextRequest("http://localhost/api/workspace/tasks/reminders", { method: "POST", body: body === undefined ? undefined : JSON.stringify(body), headers })

beforeEach(() => vi.clearAllMocks())

describe("POST /api/workspace/tasks/reminders", () => {
  it("is service-only", async () => {
    expect((await POST(req(undefined, {}))).status).toBe(401)
    authMock.mockReturnValueOnce({ user: { user_id: "u", email: "u@x.id" }, token: "t" })
    expect((await POST(req(undefined, {}))).status).toBe(403)
  })

  it("runs a pass, optionally ignoring the send hour", async () => {
    expect(await (await POST(req())).json()).toEqual({ skipped: "too-early" })
    expect(await (await POST(req({ force: true }))).json()).toEqual({ day: "2026-11-18", sent: 1 })
  })
})
