import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { signBody } from "@/lib/kapso"

const created: unknown[] = []
vi.mock("@/lib/crmServer", () => ({
  crmFor: () => ({
    listContacts: async () => [{ id: "c1", name: "Maya", phone: "0812-3456-7890" }],
    createContact: async () => ({ id: "n1", name: "x", phone: "x" }),
    createActivity: async (b: unknown) => void created.push(b),
    getContact: async () => null,
    listContactActivities: async () => [],
  }),
}))
vi.mock("@/lib/whatsappDrafts", () => ({ getDraftSetting: async () => false, saveDraft: async () => {} }))

import { POST } from "./route"

const body = (id: string) =>
  JSON.stringify({ message: { id, timestamp: "1730092800", type: "text", from: "6281234567890", text: { body: "Halo" }, kapso: { direction: "inbound" } }, conversation: { contact_name: "Maya", phone_number: "6281234567890" } })
const req = (raw: string, sig: string | null, event = "whatsapp.message.received") =>
  new NextRequest("http://localhost/dashboard/api/whatsapp/webhook", { method: "POST", body: raw, headers: { ...(sig ? { "x-webhook-signature": sig } : {}), "x-webhook-event": event } })

describe("POST /api/whatsapp/webhook (Aivory number)", () => {
  beforeEach(() => {
    created.length = 0
    process.env.KAPSO_API_KEY = "key-key-key-key"
    process.env.KAPSO_PHONE_NUMBER_ID = "999"
    process.env.KAPSO_WEBHOOK_SECRET = "s3cret"
    process.env.KAPSO_CRM_TENANT_ID = "tenant-1"
  })

  it("404s when the Aivory number is not configured", async () => {
    delete process.env.KAPSO_API_KEY
    expect((await POST(req(body("a"), "x"))).status).toBe(404)
  })
  it("401s without a valid signature and writes nothing", async () => {
    expect((await POST(req(body("a"), null))).status).toBe(401)
    expect((await POST(req(body("a"), signBody("other body", "s3cret")))).status).toBe(401)
    expect(created).toHaveLength(0)
  })
  it("logs a signed inbound message on the matching contact", async () => {
    const raw = body("wamid.100")
    const res = await POST(req(raw, signBody(raw, "s3cret")))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, logged: 1 })
    expect(created).toEqual([{ kind: "note", subject_type: "contact", subject_id: "c1", body: "WhatsApp received: Halo" }])
  })
  it("acknowledges a retry of the same message without logging it twice", async () => {
    const raw = body("wamid.200")
    await POST(req(raw, signBody(raw, "s3cret")))
    const again = await POST(req(raw, signBody(raw, "s3cret")))
    expect(await again.json()).toMatchObject({ duplicates: 1, logged: 0 })
    expect(created).toHaveLength(1)
  })
  it("ignores other event types", async () => {
    const raw = body("wamid.300")
    const res = await POST(req(raw, signBody(raw, "s3cret"), "whatsapp.message.delivered"))
    expect(await res.json()).toMatchObject({ ignored: true })
    expect(created).toHaveLength(0)
  })
})
