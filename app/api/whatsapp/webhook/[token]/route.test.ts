import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { metaSign } from "@/lib/whatsapp/meta"
import { twilioSign } from "@/lib/whatsapp/twilio"

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
vi.mock("@/lib/whatsappDrafts", () => ({ getDraftConfig: async () => ({ draftReplies: false, agent: null, replyMode: "approval" }), saveDraft: async () => {}, deleteDraft: async () => {}, countAutoReplies: async () => ({ contactCount: 0, accountCount: 0 }), recordAutoReply: async () => {} }))
let stored: { userId: string; conn: unknown } | null = null
vi.mock("@/lib/whatsappConnection", () => ({ getConnectionByToken: async () => stored, aivoryTenant: () => null }))

import { GET, POST } from "./route"

const TOKEN = "a".repeat(36)
const params = { params: Promise.resolve({ token: TOKEN }) }
const URL_ = `https://dash.test/dashboard/api/whatsapp/webhook/${TOKEN}`

describe("customer webhook (/webhook/[token])", () => {
  beforeEach(() => {
    created.length = 0
    process.env.WHATSAPP_WEBHOOK_BASE = "https://dash.test/dashboard"
  })

  it("404s an unknown or malformed token", async () => {
    stored = null
    expect((await POST(new NextRequest(URL_, { method: "POST", body: "{}" }), params)).status).toBe(404)
    expect((await POST(new NextRequest(URL_, { method: "POST", body: "{}" }), { params: Promise.resolve({ token: "nope" }) })).status).toBe(404)
  })

  it("Meta: answers the verify handshake and logs a signed message", async () => {
    stored = { userId: "t1", conn: { provider: "meta", creds: { access_token: "t", phone_number_id: "1", app_secret: "appsecret" }, webhookSecret: "verify-me" } }
    const ok = await GET(new NextRequest(`${URL_}?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=777`), params)
    expect(await ok.text()).toBe("777")
    expect((await GET(new NextRequest(`${URL_}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=777`), params)).status).toBe(403)

    const raw = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: "wamid.m1", from: "6281234567890", timestamp: "1730092800", type: "text", text: { body: "Halo" } }] } }] }] })
    const res = await POST(new NextRequest(URL_, { method: "POST", body: raw, headers: { "x-hub-signature-256": `sha256=${metaSign(raw, "appsecret")}` } }), params)
    expect(res.status).toBe(200)
    expect(created).toEqual([{ kind: "note", subject_type: "contact", subject_id: "c1", body: "WhatsApp received: Halo" }])
    expect((await POST(new NextRequest(URL_, { method: "POST", body: raw, headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) } }), params)).status).toBe(401)
  })

  it("Twilio: verifies against the public URL and answers with empty TwiML", async () => {
    stored = { userId: "t1", conn: { provider: "twilio", creds: { account_sid: "AC" + "a".repeat(32), auth_token: "tw-token-tw-token", from_number: "+1415" }, webhookSecret: "unused" } }
    const raw = "MessageSid=SM77&From=whatsapp%3A%2B6281234567890&Body=Hai&ProfileName=Maya"
    const sig = twilioSign(URL_, new URLSearchParams(raw), "tw-token-tw-token")
    const res = await POST(new NextRequest(URL_, { method: "POST", body: raw, headers: { "x-twilio-signature": sig, "content-type": "application/x-www-form-urlencoded" } }), params)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("text/xml")
    expect(await res.text()).toBe("<Response/>")
    expect(created).toHaveLength(1)
    const bad = await POST(new NextRequest(URL_, { method: "POST", body: raw, headers: { "x-twilio-signature": "AAAA" } }), params)
    expect(bad.status).toBe(401)
  })
})
