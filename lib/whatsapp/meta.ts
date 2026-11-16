/**
 * Meta WhatsApp Cloud API, directly. Send: POST graph.facebook.com/{v}/{phone_number_id}/messages
 * with a Bearer token. Inbound: webhook POST signed `X-Hub-Signature-256: sha256=<hex HMAC-SHA256 of the
 * raw body with the app secret>`; the setup handshake is a GET with hub.* params. SERVER-ONLY.
 */
import { createHmac, timingSafeEqual } from "crypto"
import { classifySendError, readJson } from "./errors"
import { MAX_TEXT, type Creds, type Inbound, type InboundCtx, type SendResult } from "./types"

export const META_BASE = "https://graph.facebook.com/v21.0"

const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {})
const asStr = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null)

export function metaSign(raw: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(raw).digest("hex")
}

export function metaVerify(ctx: InboundCtx, c: Creds): boolean {
  const given = (ctx.headers.get("x-hub-signature-256") ?? "").trim().replace(/^sha256=/i, "").toLowerCase()
  if (!c.app_secret || !/^[0-9a-f]{64}$/.test(given)) return false
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(metaSign(ctx.raw, c.app_secret), "hex"))
}

/** Meta's setup handshake: echo hub.challenge when hub.verify_token is ours. */
export function metaChallenge(params: URLSearchParams, verifyToken: string): string | null {
  if (params.get("hub.mode") !== "subscribe" || !verifyToken) return null
  const given = params.get("hub.verify_token") ?? ""
  if (given.length !== verifyToken.length || !timingSafeEqual(Buffer.from(given), Buffer.from(verifyToken))) return null
  return params.get("hub.challenge")
}

export function metaParse(ctx: InboundCtx): Inbound[] {
  const out: Inbound[] = []
  const root = asObj(JSON.parse(ctx.raw))
  for (const entry of Array.isArray(root.entry) ? root.entry : []) {
    for (const change of Array.isArray(asObj(entry).changes) ? (asObj(entry).changes as unknown[]) : []) {
      const value = asObj(asObj(change).value)
      const names = new Map<string, string>()
      for (const c of Array.isArray(value.contacts) ? value.contacts : []) {
        const wa = asStr(asObj(c).wa_id)
        const nm = asStr(asObj(asObj(c).profile).name)
        if (wa && nm) names.set(wa, nm)
      }
      for (const m of Array.isArray(value.messages) ? value.messages : []) {
        const o = asObj(m)
        const id = asStr(o.id)
        const from = (asStr(o.from) ?? "").replace(/\D/g, "")
        if (!id || from.length < 7) continue
        const type = asStr(o.type) ?? "text"
        const text = asStr(asObj(o.text).body) ?? asStr(asObj(o[type]).caption) ?? `(${type})`
        const secs = Number(o.timestamp)
        out.push({ id, from, name: names.get(from) ?? null, text: text.slice(0, MAX_TEXT), at: Number.isFinite(secs) && secs > 0 ? new Date(secs * 1000).toISOString() : new Date().toISOString() })
      }
    }
  }
  return out
}

export async function metaSend(c: Creds, toDigits: string, text: string, f: typeof fetch = fetch): Promise<SendResult> {
  let r: Response
  try {
    r = await f(`${META_BASE}/${encodeURIComponent(c.phone_number_id)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${c.access_token}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to: toDigits, type: "text", text: { body: text } }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return { ok: false, status: 0, code: "unavailable", message: "The WhatsApp provider is unavailable right now. Try again shortly." }
  }
  const j = await readJson(r)
  if (!r.ok) return classifySendError(r.status, j)
  return { ok: true, id: asStr(asObj((asObj(j).messages as unknown[] | undefined)?.[0]).id) }
}
