import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

let mode: "aivory" | "own" | null = "aivory"
let stored = false
vi.mock("@/lib/planGate", () => ({ ANY_MODULE: "*", requirePaidPlan: async () => ({ ok: true, user: { user_id: "t1" } }) }))
vi.mock("@/lib/whatsappConnection", () => ({ getConnection: async () => (mode ? { mode } : null) }))
vi.mock("@/lib/whatsappDrafts", () => ({ getDraftSetting: async () => stored, setDraftSetting: async (_u: string, on: boolean) => void (stored = on) }))

import { GET, PUT } from "./route"

const put = (b: unknown) => PUT(new NextRequest("http://x.test/dashboard/api/whatsapp/settings", { method: "PUT", body: JSON.stringify(b) }))
const get = () => GET(new NextRequest("http://x.test/dashboard/api/whatsapp/settings"))

describe("whatsapp settings: assistant drafts only on Aivory's own number", () => {
  beforeEach(() => {
    mode = "aivory"
    stored = false
  })
  it("lets the Aivory number turn drafts on and reports them available", async () => {
    expect((await put({ draft_replies: true })).status).toBe(200)
    expect(await (await get()).json()).toEqual({ draft_replies: true, available: true })
  })
  it("refuses a customer's own number, and never reports a stale 'on' as active", async () => {
    mode = "own"
    expect((await put({ draft_replies: true })).status).toBe(403)
    stored = true // e.g. left over from before
    expect(await (await get()).json()).toEqual({ draft_replies: false, available: false })
    expect((await put({ draft_replies: false })).status).toBe(200) // turning off is always fine
  })
  it("rejects a non-boolean", async () => {
    expect((await put({ draft_replies: "yes" })).status).toBe(400)
  })
})
