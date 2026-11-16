/**
 * Kapso (WhatsApp Cloud API proxy) client and webhook helpers. SERVER-ONLY: it
 * handles API keys and webhook secrets. Pure apart from the injected `fetch`.
 *
 * Docs used: send via POST {base}/meta/whatsapp/v24.0/{phone_number_id}/messages
 * with `X-API-Key`; per-number webhooks registered at
 * POST {base}/platform/v1/whatsapp/phone_numbers/{id}/webhooks; payloads are
 * signed with HMAC-SHA256 (hex, header `X-Webhook-Signature`) over the raw body.
 */
import { createHmac, timingSafeEqual } from "crypto"

export const KAPSO_BASE = "https://api.kapso.ai"
export const INBOUND_EVENT = "whatsapp.message.received"
import { MAX_TEXT as LIMIT } from "./kapsoLimits"
export const MAX_TEXT = LIMIT

export type KapsoConfig = { apiKey: string; phoneNumberId: string }
type Fetch = typeof fetch

/** Constant-time check of `X-Webhook-Signature` (hex HMAC-SHA256 of the exact raw body). */
export function verifySignature(raw: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false
  const given = header.trim().replace(/^sha256=/i, "").toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(given)) return false
  const expected = createHmac("sha256", secret).update(raw).digest("hex")
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"))
}

export function signBody(raw: string, secret: string): string {
  return createHmac("sha256", secret).update(raw).digest("hex")
}

export type Inbound = { id: string; from: string; name: string | null; text: string; at: string }

const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {})
const asStr = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null)

function one(item: unknown): Inbound | null {
  const root = asObj(item)
  const m = asObj(root.message)
  const conv = asObj(root.conversation)
  const kapso = asObj(m.kapso)
  if (kapso.direction === "outbound") return null
  const id = asStr(m.id)
  const from = (asStr(m.from) ?? asStr(conv.phone_number) ?? "").replace(/\D/g, "")
  if (!id || from.length < 7) return null
  const type = asStr(m.type) ?? "text"
  const typed = asObj(m[type])
  const text = asStr(asObj(m.text).body) ?? asStr(typed.caption) ?? asStr(kapso.content) ?? `(${type})`
  const secs = Number(m.timestamp)
  const at = Number.isFinite(secs) && secs > 0 ? new Date(secs * 1000).toISOString() : new Date().toISOString()
  return { id, from, name: asStr(conv.contact_name), text: text.slice(0, MAX_TEXT), at }
}

/** Inbound messages in a webhook body, whether single or in Kapso's `batch` envelope. Outbound echoes are dropped. */
export function parseInbound(body: unknown): Inbound[] {
  const root = asObj(body)
  const items = root.batch === true && Array.isArray(root.data) ? root.data : [body]
  return items.map(one).filter((x): x is Inbound => x !== null)
}

export type SendResult = { ok: true; id: string | null } | { ok: false; status: number; code: "window_closed" | "bad_key" | "rejected" | "unavailable"; message: string }

/** Meta error 131047 = "re-engagement message": outside the 24-hour window, a template is required. */
export function classifyError(status: number, body: unknown): Extract<SendResult, { ok: false }> {
  const err = asObj(asObj(body).error)
  const message = asStr(err.message) ?? asStr(asObj(body).message) ?? `Kapso answered ${status}`
  if (err.code === 131047 || /24.?hour|re-?engagement/i.test(message)) {
    return { ok: false, status, code: "window_closed", message: "WhatsApp only allows free-form messages within 24 hours of their last message. Use an approved template to start the chat again." }
  }
  if (status === 401 || status === 403) return { ok: false, status, code: "bad_key", message: "Kapso rejected the API key." }
  if (status >= 500) return { ok: false, status, code: "unavailable", message: "Kapso is unavailable right now. Try again shortly." }
  return { ok: false, status, code: "rejected", message }
}

async function readJson(r: Response): Promise<unknown> {
  try {
    return await r.json()
  } catch {
    return {}
  }
}

export async function sendText(cfg: KapsoConfig, toDigits: string, text: string, f: Fetch = fetch): Promise<SendResult> {
  let r: Response
  try {
    r = await f(`${KAPSO_BASE}/meta/whatsapp/v24.0/${encodeURIComponent(cfg.phoneNumberId)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": cfg.apiKey },
      body: JSON.stringify({ messaging_product: "whatsapp", to: toDigits, type: "text", text: { body: text } }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return { ok: false, status: 0, code: "unavailable", message: "Kapso is unavailable right now. Try again shortly." }
  }
  const j = await readJson(r)
  if (!r.ok) return classifyError(r.status, j)
  const first = (asObj(j).messages as unknown[] | undefined)?.[0]
  return { ok: true, id: asStr(asObj(first).id) }
}

/** Subscribe `url` to inbound messages for the number. A 401/403 here also tells us the key is wrong. */
export async function registerWebhook(cfg: KapsoConfig, url: string, secret: string, f: Fetch = fetch): Promise<{ ok: true } | { ok: false; code: "bad_key" | "rejected" | "unavailable"; message: string }> {
  let r: Response
  try {
    r = await f(`${KAPSO_BASE}/platform/v1/whatsapp/phone_numbers/${encodeURIComponent(cfg.phoneNumberId)}/webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": cfg.apiKey },
      body: JSON.stringify({ whatsapp_webhook: { url, events: [INBOUND_EVENT], secret_key: secret } }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return { ok: false, code: "unavailable", message: "Kapso is unavailable right now. Try again shortly." }
  }
  if (r.ok) return { ok: true }
  const e = classifyError(r.status, await readJson(r))
  return { ok: false, code: e.code === "window_closed" ? "rejected" : e.code, message: e.message }
}
