/**
 * KirimDev (Indonesian WhatsApp Business API platform). Its /v1 API mirrors Meta's Cloud API:
 *   send     POST {base}/v1/messages  (Bearer key; Meta-style body; answers {message_id})
 *   webhook  POST {base}/v1/webhook_subscriptions {url, events}; the response carries `initial_secret`
 *            (shown once, and it is the signing key, so we store the one KirimDev gives us)
 *   inbound  Meta's webhook envelope (see meta.ts), event named in X-Kirim-Event, id in X-Kirim-Event-Id
 *
 * KirimDev's docs describe the signature two ways: `X-Kirim-Signature: t=<unix>,v1=<hex>` and a plain
 * HMAC-SHA256 hex of the raw body. Both are keyed by the same secret and unforgeable without it, so
 * `kirimVerify` accepts either; a timestamped one must be within 5 minutes. SERVER-ONLY.
 */
import { createHmac, timingSafeEqual } from "crypto"
import { classifySendError, readJson } from "./errors"
import { metaParse } from "./meta"
import type { Creds, InboundCtx, RegisterResult, SendResult } from "./types"

export const KIRIM_BASE = process.env.KIRIMDEV_API_BASE?.replace(/\/$/, "") || "https://api.kirimdev.com"
export const KIRIM_EVENT = "message.received"
const TOLERANCE_S = 300

const hmac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex")
const same = (a: string, b: string) => /^[0-9a-f]{64}$/.test(a) && a.length === b.length && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"))

export function kirimSign(raw: string, secret: string, t?: number): string {
  return t === undefined ? hmac(secret, raw) : `t=${t},v1=${hmac(secret, `${t}.${raw}`)}`
}

export function kirimVerify(ctx: InboundCtx, secret: string, nowMs = Date.now()): boolean {
  const header = (ctx.headers.get("x-kirim-signature") ?? ctx.headers.get("x-hub-signature-256") ?? "").trim()
  if (!header || !secret) return false
  const rawOnly = hmac(secret, ctx.raw)
  if (!header.includes("v1=")) return same(header.replace(/^sha256=/i, "").toLowerCase(), rawOnly)
  const parts = header.split(",").map((p) => p.trim())
  const t = parts.find((p) => p.startsWith("t="))?.slice(2)
  const given = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3).toLowerCase())
  const stamped = t && /^\d{9,12}$/.test(t) ? hmac(secret, `${t}.${ctx.raw}`) : null
  if (stamped && Math.abs(nowMs / 1000 - Number(t)) > TOLERANCE_S && given.some((g) => same(g, stamped))) return false
  return given.some((g) => same(g, rawOnly) || (stamped !== null && same(g, stamped)))
}

export const kirimWanted = (ctx: InboundCtx): boolean => {
  const e = ctx.headers.get("x-kirim-event")
  return !e || e === KIRIM_EVENT
}

export const kirimParse = metaParse

export async function kirimSend(c: Creds, toDigits: string, text: string, f: typeof fetch = fetch): Promise<SendResult> {
  let r: Response
  try {
    r = await f(`${KIRIM_BASE}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${c.api_key}` },
      body: JSON.stringify({ to: toDigits, type: "text", text: { body: text } }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return { ok: false, status: 0, code: "unavailable", message: "The WhatsApp provider is unavailable right now. Try again shortly." }
  }
  const j = (await readJson(r)) as { message_id?: unknown; data?: { message_id?: unknown } }
  if (!r.ok) return classifySendError(r.status, j)
  const id = j.message_id ?? j.data?.message_id
  return { ok: true, id: typeof id === "string" ? id : null }
}

/** Subscribe to inbound messages. KirimDev picks the signing secret, so it is returned for us to store. */
export async function kirimRegister(c: Creds, url: string, f: typeof fetch = fetch): Promise<RegisterResult> {
  let r: Response
  try {
    r = await f(`${KIRIM_BASE}/v1/webhook_subscriptions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${c.api_key}` },
      body: JSON.stringify({ url, events: [KIRIM_EVENT], description: "Aivory CRM" }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return { ok: false, code: "unavailable", message: "The WhatsApp provider is unavailable right now. Try again shortly." }
  }
  const j = (await readJson(r)) as { data?: { initial_secret?: unknown } }
  if (!r.ok) {
    const e = classifySendError(r.status, j)
    return { ok: false, code: e.code === "window_closed" ? "rejected" : e.code, message: e.message }
  }
  const secret = j.data?.initial_secret
  if (typeof secret !== "string" || secret.length < 8) return { ok: false, code: "rejected", message: "KirimDev did not return a signing secret for the webhook." }
  return { ok: true, secret }
}
