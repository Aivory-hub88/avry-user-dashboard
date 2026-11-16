import { createHmac } from "crypto"
import { describe, expect, it, vi } from "vitest"
import { classifySendError } from "./errors"
import { metaChallenge, metaParse, metaSend, metaSign, metaVerify } from "./meta"
import { checkCreds, PROVIDERS } from "./providerMeta"
import { getProvider } from "./providers"
import { twilioParse, twilioSend, twilioSign, twilioVerify } from "./twilio"

const ctx = (raw: string, headers: Record<string, string> = {}, url = "https://x.test/hook") => ({ raw, headers: new Headers(headers), url })
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
const calls = (f: typeof fetch) => (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls

describe("registry + credentials", () => {
  it("has an adapter and a credential form for every provider", () => {
    for (const p of PROVIDERS) expect(getProvider(p.id)?.id).toBe(p.id)
    expect(getProvider("nope")).toBeNull()
  })
  it("validates only the declared fields and names the first problem", () => {
    expect(checkCreds("kapso", { api_key: "k".repeat(20), phone_number_id: "12345678", extra: "dropped" })).toEqual({ creds: { api_key: "k".repeat(20), phone_number_id: "12345678" }, problem: null })
    expect(checkCreds("kapso", { api_key: "short", phone_number_id: "1" }).problem).toMatch(/api key/i)
    expect(checkCreds("twilio", { account_sid: "AC" + "a".repeat(32), auth_token: "t".repeat(32), from_number: "0812" }).problem).toMatch(/whatsapp number/i)
    expect(checkCreds("meta", { access_token: "t".repeat(30), phone_number_id: "123456", app_secret: "ab".repeat(16) }).problem).toBeNull()
  })
})

describe("meta", () => {
  const creds = { access_token: "tok", phone_number_id: "999", app_secret: "appsecret" }
  const payload = JSON.stringify({
    entry: [{ changes: [{ value: { contacts: [{ wa_id: "6281234567890", profile: { name: "Maya" } }], messages: [{ id: "wamid.1", from: "6281234567890", timestamp: "1730092800", type: "text", text: { body: "Halo" } }, { id: "wamid.2", from: "6281234567890", timestamp: "1730092801", type: "image", image: { caption: "foto" } }] } }] }],
  })
  it("verifies X-Hub-Signature-256 against the app secret", () => {
    const sig = `sha256=${metaSign(payload, "appsecret")}`
    expect(metaVerify(ctx(payload, { "x-hub-signature-256": sig }), creds)).toBe(true)
    expect(metaVerify(ctx(payload + " ", { "x-hub-signature-256": sig }), creds)).toBe(false)
    expect(metaVerify(ctx(payload), creds)).toBe(false)
    expect(metaVerify(ctx(payload, { "x-hub-signature-256": sig }), { ...creds, app_secret: "other" })).toBe(false)
  })
  it("parses messages with the contact's profile name, and ignores status-only deliveries", () => {
    expect(metaParse(ctx(payload)).map((m) => [m.id, m.name, m.text])).toEqual([["wamid.1", "Maya", "Halo"], ["wamid.2", "Maya", "foto"]])
    expect(metaParse(ctx(JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: "x" }] } }] }] })))).toEqual([])
  })
  it("answers the setup handshake only for the right verify token", () => {
    const q = (t: string) => new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": t, "hub.challenge": "1234" })
    expect(metaChallenge(q("tok"), "tok")).toBe("1234")
    expect(metaChallenge(q("bad"), "tok")).toBeNull()
    expect(metaChallenge(new URLSearchParams({ "hub.mode": "subscribe", "hub.challenge": "1" }), "tok")).toBeNull()
  })
  it("sends with a Bearer token and maps the 24-hour error", async () => {
    const f = reply(200, { messages: [{ id: "wamid.out" }] })
    expect(await metaSend(creds, "6281", "hi", f)).toEqual({ ok: true, id: "wamid.out" })
    const [url, init] = calls(f)[0]
    expect(url).toBe("https://graph.facebook.com/v21.0/999/messages")
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok")
    expect(await metaSend(creds, "6281", "hi", reply(400, { error: { code: 131047, message: "x" } }))).toMatchObject({ code: "window_closed" })
  })
})

describe("twilio", () => {
  const creds = { account_sid: "AC" + "a".repeat(32), auth_token: "12345", from_number: "+14155238886" }
  it("signs URL + name/value pairs in name order with HMAC-SHA1, base64 (Twilio's published algorithm)", () => {
    // Twilio publishes no reproducible test vector (its example omits the token), so this re-derives the
    // string independently. A first real delivery from Twilio is the end-to-end check.
    const p = new URLSearchParams({ To: "+18005551212", CallSid: "CA1", From: "+1415", Digits: "1234" })
    const expected = createHmac("sha1", "12345").update("https://x.test/hookCallSidCA1Digits1234From+1415To+18005551212").digest("base64")
    expect(twilioSign("https://x.test/hook", p, "12345")).toBe(expected)
  })
  it("counts every value of a repeated parameter", () => {
    const one = twilioSign("https://x.test/h", new URLSearchParams("A=1"), "k")
    const two = twilioSign("https://x.test/h", new URLSearchParams("A=1&A=2"), "k")
    expect(two).not.toBe(one)
    expect(twilioSign("https://x.test/h", new URLSearchParams("A=2&A=1"), "k")).toBe(two)
  })
  it("verifies the signature over the exact URL and params", () => {
    const raw = "MessageSid=SM1&From=whatsapp%3A%2B6281234567890&Body=Halo&ProfileName=Maya"
    const sig = twilioSign("https://x.test/hook", new URLSearchParams(raw), "12345")
    expect(twilioVerify(ctx(raw, { "x-twilio-signature": sig }), creds)).toBe(true)
    expect(twilioVerify(ctx(raw, { "x-twilio-signature": sig }, "https://x.test/other"), creds)).toBe(false)
    expect(twilioVerify(ctx(raw + "&Body=x", { "x-twilio-signature": sig }), creds)).toBe(false)
    expect(twilioVerify(ctx(raw), creds)).toBe(false)
  })
  it("parses an inbound message and skips status callbacks", () => {
    expect(twilioParse(ctx("MessageSid=SM1&From=whatsapp%3A%2B6281234567890&Body=Halo&ProfileName=Maya"))).toMatchObject([{ id: "SM1", from: "6281234567890", name: "Maya", text: "Halo" }])
    expect(twilioParse(ctx("MessageSid=SM1&From=whatsapp%3A%2B6281234567890&NumMedia=1&Body="))[0].text).toBe("(media)")
    expect(twilioParse(ctx("MessageSid=SM2&MessageStatus=delivered&To=whatsapp%3A%2B6281234567890"))).toEqual([])
  })
  it("sends a form-encoded message with Basic auth and maps error 63016", async () => {
    const f = reply(201, { sid: "SM9" })
    expect(await twilioSend(creds, "6281234567890", "hi", f)).toEqual({ ok: true, id: "SM9" })
    const [url, init] = calls(f)[0]
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${creds.account_sid}/Messages.json`)
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({ From: "whatsapp:+14155238886", To: "whatsapp:+6281234567890", Body: "hi" })
    expect(await twilioSend(creds, "6281", "hi", reply(400, { code: 63016, message: "Failed to send freeform message because you are outside the allowed window" }))).toMatchObject({ code: "window_closed" })
  })
})

describe("classifySendError", () => {
  it("reads Meta- and Twilio-shaped bodies", () => {
    expect(classifySendError(401, {}).code).toBe("bad_key")
    expect(classifySendError(500, {}).code).toBe("unavailable")
    expect(classifySendError(400, { message: "Invalid 'To' number" })).toMatchObject({ code: "rejected", message: "Invalid 'To' number" })
  })
})
