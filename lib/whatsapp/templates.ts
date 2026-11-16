/**
 * Pure helpers for WhatsApp templates in Meta's Cloud API shape (also what Kapso proxies):
 * reading the approved list, deciding which templates we can fill from a text box, rendering a
 * preview, and building the send body. No I/O here; the adapters call these.
 */
import type { WaTemplate } from "./types"

const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {})
const asStr = (v: unknown): string => (typeof v === "string" ? v : "")
const POSITIONAL = /\{\{\s*(\d+)\s*\}\}/g

/** Highest positional variable in a text ({{1}}, {{2}}), 0 when none. */
export function countParams(text: string): number {
  let n = 0
  for (const m of text.matchAll(POSITIONAL)) n = Math.max(n, Number(m[1]))
  return n
}

export function renderTemplate(body: string, params: string[]): string {
  return body.replace(POSITIONAL, (_, i: string) => params[Number(i) - 1] ?? "")
}

/** Convert one Meta template object; null when it isn't approved or has no body. */
export function parseMetaTemplate(t: unknown): WaTemplate | null {
  const o = asObj(t)
  if (asStr(o.status).toUpperCase() !== "APPROVED") return null
  const components = Array.isArray(o.components) ? o.components.map(asObj) : []
  const body = components.find((c) => asStr(c.type).toUpperCase() === "BODY")
  const text = asStr(body?.text)
  if (!asStr(o.name) || !text) return null
  let usable = asStr(o.parameter_format).toUpperCase() !== "NAMED"
  for (const c of components) {
    const type = asStr(c.type).toUpperCase()
    if (type === "HEADER" && (asStr(c.format).toUpperCase() !== "TEXT" || countParams(asStr(c.text)) > 0)) usable = false
    if (type === "BUTTONS") {
      for (const b of Array.isArray(c.buttons) ? c.buttons.map(asObj) : []) {
        const bt = asStr(b.type).toUpperCase()
        if (bt === "COPY_CODE" || bt === "OTP" || bt === "FLOW" || bt === "MPM" || bt === "CATALOG" || (bt === "URL" && countParams(asStr(b.url)) > 0)) usable = false
      }
    }
    if (type === "CAROUSEL" || type === "LIMITED_TIME_OFFER") usable = false
  }
  return { name: asStr(o.name), language: asStr(o.language) || "en", category: asStr(o.category).toLowerCase(), body: text, params: countParams(text), usable }
}

export function parseMetaTemplates(json: unknown): WaTemplate[] {
  const data = asObj(json).data
  return (Array.isArray(data) ? data : []).map(parseMetaTemplate).filter((t): t is WaTemplate => t !== null)
}

/** Meta Cloud API body for a template message (text variables only). */
export function templateMessageBody(toDigits: string, name: string, language: string, params: string[]) {
  return {
    messaging_product: "whatsapp",
    to: toDigits,
    type: "template",
    template: {
      name,
      language: { code: language },
      components: params.length ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] : [],
    },
  }
}
