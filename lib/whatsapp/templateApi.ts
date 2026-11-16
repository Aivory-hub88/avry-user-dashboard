/** Template list/send over a Meta-style HTTP API (Meta directly, or Kapso's Meta proxy). SERVER-ONLY. */
import { classifySendError, readJson } from "./errors"
import { parseMetaTemplates, templateMessageBody } from "./templates"
import type { SendResult, TemplateList } from "./types"

const UNAVAILABLE_MESSAGE = "The WhatsApp provider is unavailable right now. Try again shortly."
const MAX_PAGES = 5

/** Approved templates of a WhatsApp Business Account. `base` already includes the API version. */
export async function listMetaTemplates(base: string, wabaId: string, headers: Record<string, string>, f: typeof fetch = fetch): Promise<TemplateList> {
  const out = []
  let url: string | null = `${base}/${encodeURIComponent(wabaId)}/message_templates?limit=100&status=APPROVED`
  for (let page = 0; url && page < MAX_PAGES; page++) {
    let r: Response
    try {
      r = await f(url, { headers, signal: AbortSignal.timeout(10_000) })
    } catch {
      return { ok: false, code: "unavailable", message: UNAVAILABLE_MESSAGE }
    }
    const j = await readJson(r)
    if (!r.ok) {
      const e = classifySendError(r.status, j)
      return { ok: false, code: e.code === "window_closed" ? "rejected" : e.code, message: e.message }
    }
    out.push(...parseMetaTemplates(j))
    const next = (j as { paging?: { next?: unknown } }).paging?.next
    // Only follow a next link on the same host we asked.
    url = typeof next === "string" && new URL(next).host === new URL(base).host ? next : null
  }
  return { ok: true, templates: out.sort((a, b) => a.name.localeCompare(b.name)) }
}

export async function sendMetaTemplate(sendUrl: string, headers: Record<string, string>, toDigits: string, name: string, language: string, params: string[], f: typeof fetch = fetch): Promise<SendResult> {
  let r: Response
  try {
    r = await f(sendUrl, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(templateMessageBody(toDigits, name, language, params)), signal: AbortSignal.timeout(10_000) })
  } catch {
    return { ok: false, status: 0, code: "unavailable", message: UNAVAILABLE_MESSAGE }
  }
  const j = await readJson(r)
  if (!r.ok) return classifySendError(r.status, j)
  const id = (j as { messages?: { id?: unknown }[] }).messages?.[0]?.id
  return { ok: true, id: typeof id === "string" ? id : null }
}
