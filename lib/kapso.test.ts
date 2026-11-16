import { describe, expect, it, vi } from "vitest"
import { classifyError, parseInbound, registerWebhook, sendText, signBody, verifySignature } from "./kapso"
import { logInbound, SeenIds, type ContactRow, type CrmPort } from "./whatsappInbound"
import { lastContactMap } from "./crmContacts"

const received = (o: Record<string, unknown> = {}) => ({
  message: { id: "wamid.1", timestamp: "1730092800", type: "text", from: "6281234567890", text: { body: "Halo" }, kapso: { direction: "inbound" }, ...o },
  conversation: { id: "c1", contact_name: "Maya", phone_number: "6281234567890" },
  phone_number_id: "123",
})

describe("signature", () => {
  const raw = JSON.stringify(received())
  it("accepts the HMAC of the exact raw body, with or without sha256=", () => {
    const sig = signBody(raw, "s3cret")
    expect(verifySignature(raw, sig, "s3cret")).toBe(true)
    expect(verifySignature(raw, `sha256=${sig}`, "s3cret")).toBe(true)
  })
  it("rejects a wrong secret, a changed body, junk or a missing header", () => {
    const sig = signBody(raw, "s3cret")
    expect(verifySignature(raw, sig, "other")).toBe(false)
    expect(verifySignature(raw + " ", sig, "s3cret")).toBe(false)
    expect(verifySignature(raw, "zz", "s3cret")).toBe(false)
    expect(verifySignature(raw, null, "s3cret")).toBe(false)
    expect(verifySignature(raw, sig, "")).toBe(false)
  })
})

describe("parseInbound", () => {
  it("reads a text message", () => {
    expect(parseInbound(received())).toEqual([{ id: "wamid.1", from: "6281234567890", name: "Maya", text: "Halo", at: "2024-10-28T05:20:00.000Z" }])
  })
  it("reads a batch envelope and drops outbound echoes", () => {
    const out = parseInbound({ batch: true, data: [received(), received({ id: "wamid.2", kapso: { direction: "outbound" } }), received({ id: "wamid.3", text: undefined, type: "image", image: { caption: "foto" } })] })
    expect(out.map((m) => [m.id, m.text])).toEqual([["wamid.1", "Halo"], ["wamid.3", "foto"]])
  })
  it("names media without a caption by its type and ignores unusable payloads", () => {
    expect(parseInbound(received({ text: undefined, type: "audio" }))[0].text).toBe("(audio)")
    expect(parseInbound({})).toEqual([])
    expect(parseInbound(received({ id: undefined }))).toEqual([])
    expect(parseInbound(received({ from: "12" }))).toEqual([])
  })
})

describe("send / register", () => {
  const cfg = { apiKey: "k", phoneNumberId: "999" }
  const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
  it("posts a Meta-style text message with the API key", async () => {
    const f = reply(200, { messages: [{ id: "wamid.out" }] })
    expect(await sendText(cfg, "6281", "hi", f)).toEqual({ ok: true, id: "wamid.out" })
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toBe("https://api.kapso.ai/meta/whatsapp/v24.0/999/messages")
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("k")
    expect(JSON.parse(init.body as string)).toEqual({ messaging_product: "whatsapp", to: "6281", type: "text", text: { body: "hi" } })
  })
  it("tells the closed 24-hour window from a bad key and an outage", async () => {
    expect((await sendText(cfg, "6281", "hi", reply(400, { error: { code: 131047, message: "Re-engagement message" } }))) as { code: string }).toMatchObject({ code: "window_closed" })
    expect(classifyError(401, {}).code).toBe("bad_key")
    expect(classifyError(503, {}).code).toBe("unavailable")
    expect(classifyError(422, { error: { message: "Invalid number" } })).toMatchObject({ code: "rejected", message: "Invalid number" })
    const down = vi.fn(async () => { throw new Error("net") }) as unknown as typeof fetch
    expect(await sendText(cfg, "6281", "hi", down)).toMatchObject({ ok: false, code: "unavailable" })
  })
  it("registers the webhook for inbound messages", async () => {
    const f = reply(201, {})
    expect(await registerWebhook(cfg, "https://x.test/hook", "sec", f)).toEqual({ ok: true })
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toBe("https://api.kapso.ai/platform/v1/whatsapp/phone_numbers/999/webhooks")
    expect(JSON.parse(init.body as string)).toEqual({ whatsapp_webhook: { url: "https://x.test/hook", events: ["whatsapp.message.received"], secret_key: "sec" } })
    expect(await registerWebhook(cfg, "u", "s", reply(401, {}))).toMatchObject({ ok: false, code: "bad_key" })
  })
})

describe("logInbound", () => {
  const fake = (existing: ContactRow[] = []) => {
    const contacts = [...existing]
    const acts: { subject_id: string; body: string }[] = []
    const crm: CrmPort = {
      listContacts: async () => contacts,
      createContact: async (b) => {
        const c = { id: `new${contacts.length}`, name: b.name, phone: b.phone }
        contacts.push(c)
        return c
      },
      createActivity: async (b) => void acts.push({ subject_id: b.subject_id, body: b.body }),
    }
    return { crm, contacts, acts }
  }
  const msg = (id: string, from = "6281234567890", text = "Halo") => ({ id, from, name: "Maya", text, at: "2026-11-16T00:00:00.000Z" })

  it("logs on the existing contact whatever the phone format", async () => {
    const f = fake([{ id: "c1", name: "Maya Lestari", phone: "0812-3456-7890" }])
    expect(await logInbound(f.crm, [msg("a")], new SeenIds())).toMatchObject({ logged: 1, created: 0, duplicates: 0, entries: [{ contactId: "c1", contactName: "Maya Lestari", message: { id: "a" } }] })
    expect(f.acts).toEqual([{ subject_id: "c1", body: "WhatsApp received: Halo" }])
  })
  it("creates a labelled contact for an unknown number, once for several messages", async () => {
    const f = fake()
    const r = await logInbound(f.crm, [msg("a"), msg("b", "6281234567890", "Lagi")], new SeenIds())
    expect(r).toMatchObject({ logged: 2, created: 1, duplicates: 0 })
    expect(r.entries.map((e) => e.message.id)).toEqual(["a", "b"])
    expect(f.contacts).toHaveLength(1)
    expect(f.contacts[0]).toMatchObject({ name: "Maya", phone: "+6281234567890" })
  })
  it("skips a message id it has already handled (Kapso retries)", async () => {
    const f = fake()
    const seen = new SeenIds()
    await logInbound(f.crm, [msg("a")], seen)
    expect(await logInbound(f.crm, [msg("a")], seen)).toEqual({ logged: 0, created: 0, duplicates: 1, entries: [] })
    expect(f.acts).toHaveLength(1)
  })
  it("does not mark a message handled when the CRM fails, so a retry can succeed", async () => {
    const f = fake()
    const seen = new SeenIds()
    f.crm.createActivity = async () => { throw new Error("crm down") }
    await expect(logInbound(f.crm, [msg("a")], seen)).rejects.toThrow()
    expect(seen.has("a")).toBe(false)
  })
})

describe("WhatsApp counts as contact", () => {
  it("a WhatsApp note sets last contact, a plain note does not", () => {
    const base = { subject_type: "contact", subject_id: "c1", kind: "note", occurred_at: "2026-11-10T09:00:00" } as const
    const now = new Date(2026, 10, 16)
    expect(lastContactMap([{ ...base, body: "WhatsApp received: hi" }], now).get("c1")).toBe("2026-11-10T09:00:00")
    expect(lastContactMap([{ ...base, body: "called their office" }], now).size).toBe(0)
  })
})
