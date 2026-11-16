import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const sent: unknown[] = []
const logged: { body: string }[] = []
const approved = { data: [{ name: "order_update", language: "id", category: "UTILITY", status: "APPROVED", components: [{ type: "BODY", text: "Halo {{1}}, pesanan {{2}} dikirim." }] }, { name: "promo_img", language: "id", status: "APPROVED", components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Promo" }] }] }

vi.mock("@/lib/planGate", () => ({ ANY_MODULE: "*", requirePaidPlan: async () => ({ ok: true, user: { user_id: "t1" } }) }))
vi.mock("@/lib/whatsappConnection", () => ({ getConnection: async () => ({ mode: "aivory", provider: "kapso", creds: { api_key: "k".repeat(12), phone_number_id: "999" }, webhookSecret: "s", displayPhone: null }) }))
vi.mock("@/lib/crmServer", () => ({
  crmFor: () => ({
    listContacts: async () => [],
    createContact: async () => ({ id: "n", name: "x", phone: "x" }),
    createActivity: async (b: { body: string }) => void logged.push(b),
    getContact: async (id: string) => (id === "11111111-1111-4111-8111-111111111111" ? { id, name: "Irfan", phone: "+62 819 3035 1275", email: null } : null),
  }),
}))

const realFetch = globalThis.fetch
import { POST } from "./route"

const req = (b: unknown) => new NextRequest("http://x.test/dashboard/api/whatsapp/send-template", { method: "POST", body: JSON.stringify(b) })
const CID = "11111111-1111-4111-8111-111111111111"

describe("POST /api/whatsapp/send-template", () => {
  beforeEach(() => {
    sent.length = 0
    logged.length = 0
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.includes("/platform/v1/whatsapp/phone_numbers/")) return new Response(JSON.stringify({ data: { business_account_id: "555" } }))
      if (u.includes("/message_templates")) return new Response(JSON.stringify(approved))
      if (u.endsWith("/messages")) { sent.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ messages: [{ id: "wamid.t1" }] })) }
      return new Response("{}", { status: 404 })
    }) as unknown as typeof fetch
  })
  afterAll(() => { globalThis.fetch = realFetch })

  it("sends an approved template with its variables and logs the rendered text", async () => {
    const res = await POST(req({ contact_id: CID, name: "order_update", language: "id", params: ["Irfan", "A12"] }))
    expect(await res.json()).toMatchObject({ ok: true, logged: true })
    expect(sent[0]).toMatchObject({ to: "628193035127" + "5", type: "template", template: { name: "order_update", language: { code: "id" } } })
    expect(logged[0].body).toBe("WhatsApp sent: Halo Irfan, pesanan A12 dikirim.\nTemplate: order_update")
  })
  it("refuses unknown, unusable, or wrongly filled templates without sending", async () => {
    expect((await POST(req({ contact_id: CID, name: "nope", language: "id", params: [] }))).status).toBe(404)
    expect((await POST(req({ contact_id: CID, name: "promo_img", language: "id", params: [] }))).status).toBe(404)
    expect((await POST(req({ contact_id: CID, name: "order_update", language: "id", params: ["Irfan"] }))).status).toBe(400)
    expect((await POST(req({ contact_id: CID, name: "order_update", language: "id", params: ["Irfan", " "] }))).status).toBe(400)
    expect((await POST(req({ contact_id: "bad", name: "order_update", language: "id", params: ["a", "b"] }))).status).toBe(400)
    expect(sent).toHaveLength(0)
    expect(logged).toHaveLength(0)
  })
})
