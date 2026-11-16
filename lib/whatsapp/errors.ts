import type { SendResult } from "./types"

const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {})
const asStr = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null)

const WINDOW_MESSAGE = "WhatsApp only allows free-form messages within 24 hours of their last message. Use an approved template to start the chat again."

/**
 * Map a provider's error response to something a person can act on. Understands
 * Meta-shaped bodies ({error:{code,message}}; also used by Kapso) and Twilio's
 * ({code,message}). 131047 (Meta) and 63016 (Twilio) mean the 24-hour window is closed.
 */
export function classifySendError(status: number, body: unknown): Extract<SendResult, { ok: false }> {
  const b = asObj(body)
  const err = asObj(b.error)
  const code = err.code ?? b.code
  const message = asStr(err.message) ?? asStr(b.message) ?? `The provider answered ${status}`
  if (code === 131047 || code === 63016 || /24.?hour|re-?engagement|outside the allowed window/i.test(message)) {
    return { ok: false, status, code: "window_closed", message: WINDOW_MESSAGE }
  }
  if (status === 401 || status === 403) return { ok: false, status, code: "bad_key", message: "The provider rejected the credentials." }
  if (status >= 500) return { ok: false, status, code: "unavailable", message: "The WhatsApp provider is unavailable right now. Try again shortly." }
  return { ok: false, status, code: "rejected", message }
}

export async function readJson(r: Response): Promise<unknown> {
  try {
    return await r.json()
  } catch {
    return {}
  }
}
