import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

let mode: "aivory" | "own" | null = "aivory"
let cfg = { draftReplies: false, agent: null as string | null }
vi.mock("@/lib/planGate", () => ({ ANY_MODULE: "*", requirePaidPlan: async () => ({ ok: true, user: { user_id: "t1" } }) }))
vi.mock("@/lib/whatsappConnection", () => ({ getConnection: async () => (mode ? { mode } : null) }))
vi.mock("@/lib/whatsappDrafts", () => ({
  getDraftConfig: async () => cfg,
  setDraftConfig: async (_u: string, c: { draftReplies?: boolean; agent?: string | null }) => {
    cfg = { draftReplies: c.draftReplies ?? cfg.draftReplies, agent: c.agent === undefined ? cfg.agent : c.agent }
  },
}))

import { GET, PUT } from "./route"

const put = (b: unknown) => PUT(new NextRequest("http://x.test/dashboard/api/whatsapp/settings", { method: "PUT", body: JSON.stringify(b) }))
const get = async () => (await GET(new NextRequest("http://x.test/dashboard/api/whatsapp/settings"))).json()

describe("whatsapp settings: who writes reply drafts", () => {
  beforeEach(() => {
    mode = "aivory"
    cfg = { draftReplies: false, agent: null }
  })

  it("lists the customer's agents and says whether Aivory's assistant is an option", async () => {
    const g = await get()
    expect(g.agents.map((a: { type: string }) => a.type)).toContain("leads_qualifier")
    expect(g.assistant_available).toBe(true)
    mode = "own"
    expect((await get()).assistant_available).toBe(false)
  })

  it("the Aivory number may draft without choosing an agent (assistant)", async () => {
    expect((await put({ draft_replies: true })).status).toBe(200)
    expect(await get()).toMatchObject({ draft_replies: true, agent: null })
  })

  it("a customer's own number must choose an agent first", async () => {
    mode = "own"
    const refused = await put({ draft_replies: true })
    expect(refused.status).toBe(400)
    expect((await refused.json()).error).toMatch(/agent/i)
    expect((await put({ agent: "leads_qualifier" })).status).toBe(200)
    expect((await put({ draft_replies: true })).status).toBe(200)
    expect(await get()).toMatchObject({ draft_replies: true, agent: "leads_qualifier" })
  })

  it("reports a stale 'on' with no writer as off, and turning off is always allowed", async () => {
    mode = "own"
    cfg = { draftReplies: true, agent: null }
    expect((await get()).draft_replies).toBe(false)
    expect((await put({ draft_replies: false })).status).toBe(200)
  })

  it("clearing the agent while on (customer number) is refused", async () => {
    mode = "own"
    cfg = { draftReplies: true, agent: "leads_qualifier" }
    expect((await put({ agent: null })).status).toBe(400)
  })

  it("rejects an unknown agent, a non-boolean and an empty change", async () => {
    expect((await put({ agent: "not_an_agent" })).status).toBe(400)
    expect((await put({ draft_replies: "yes" })).status).toBe(400)
    expect((await put({})).status).toBe(400)
  })
})
