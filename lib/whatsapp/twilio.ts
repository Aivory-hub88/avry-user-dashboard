/**
 * Twilio WhatsApp. Send: POST api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json (form body, Basic auth).
 * Inbound: form-encoded POST signed `X-Twilio-Signature` = base64(HMAC-SHA1(auth token, full URL + each POST
 * param name+value in name order)). The URL must be exactly the one configured in Twilio. SERVER-ONLY.
 */
import { createHmac, timingSafeEqual } from "crypto"
import { classifySendError, readJson } from "./errors"
import { MAX_TEXT, type Creds, type Inbound, type InboundCtx, type SendResult } from "./types"

export const TWILIO_BASE = "https://api.twilio.com/2010-04-01"

export function twilioSign(url: string, params: URLSearchParams, authToken: string): string {
  // Names in order; a repeated name contributes every one of its values (sorted), as Twilio's own SDKs do.
  const keys = [...new Set(params.keys())].sort()
  const data = url + keys.map((k) => params.getAll(k).sort().map((v) => k + v).join("")).join("")
  return createHmac("sha1", authToken).update(data).digest("base64")
}

export function twilioVerify(ctx: InboundCtx, c: Creds): boolean {
  const given = ctx.headers.get("x-twilio-signature")
  if (!given || !c.auth_token) return false
  const expected = twilioSign(ctx.url, new URLSearchParams(ctx.raw), c.auth_token)
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function twilioParse(ctx: InboundCtx): Inbound[] {
  const p = new URLSearchParams(ctx.raw)
  const sid = p.get("MessageSid") ?? p.get("SmsMessageSid")
  const from = (p.get("From") ?? "").replace(/^whatsapp:/i, "").replace(/\D/g, "")
  // Status callbacks carry a sid but no sender/body; only real inbound messages have From + a body or media.
  if (!sid || from.length < 7 || p.get("SmsStatus") === "delivered") return []
  const media = Number(p.get("NumMedia") ?? "0")
  const text = (p.get("Body") ?? "").trim() || (media > 0 ? "(media)" : "")
  if (!text) return []
  return [{ id: sid, from, name: p.get("ProfileName") || null, text: text.slice(0, MAX_TEXT), at: new Date().toISOString() }]
}

export async function twilioSend(c: Creds, toDigits: string, text: string, f: typeof fetch = fetch): Promise<SendResult> {
  let r: Response
  try {
    r = await f(`${TWILIO_BASE}/Accounts/${encodeURIComponent(c.account_sid)}/Messages.json`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${c.account_sid}:${c.auth_token}`).toString("base64")}` },
      body: new URLSearchParams({ From: `whatsapp:${c.from_number}`, To: `whatsapp:+${toDigits}`, Body: text }).toString(),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return { ok: false, status: 0, code: "unavailable", message: "The WhatsApp provider is unavailable right now. Try again shortly." }
  }
  const j = await readJson(r)
  if (!r.ok) return classifySendError(r.status, j)
  const sid = (j as { sid?: unknown }).sid
  return { ok: true, id: typeof sid === "string" ? sid : null }
}
