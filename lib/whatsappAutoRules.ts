/**
 * Rules for replying automatically (autonomous mode). Pure and conservative: when in doubt the reply is held as a
 * draft for a person to review instead of being sent.
 */
import { isHumanSent } from "./crmWhatsapp"

export const AUTO_PER_CONTACT_PER_HOUR = 4
export const AUTO_PER_ACCOUNT_PER_HOUR = 60
/** A teammate who wrote to the contact this recently is in the conversation, so the agent stays out. */
export const HUMAN_ACTIVE_MINUTES = 15

export type HoldReason = "asked_for_human" | "human_active" | "rate_limited" | "send_failed"

export const HOLD_TEXT: Record<HoldReason, string> = {
  asked_for_human: "Held for review: they asked for a person or raised a complaint.",
  human_active: `Held for review: a teammate replied in the last ${HUMAN_ACTIVE_MINUTES} minutes.`,
  rate_limited: "Held for review: too many automatic replies to this contact in the last hour.",
  send_failed: "Could not send automatically (the chat may be outside the 24-hour window, or the provider refused). Review and send it yourself.",
}

const ESCALATE = [
  /\b(bicara|ngobrol|hubungi|telepon|telfon|call|speak|talk)\b.{0,25}\b(manusia|orang|cs|admin|petugas|staf|staff|human|person|someone|agent|representative|manager)\b/i,
  /\b(manusia|human|orang asli|real person)\b/i,
  /\b(komplain|complain\w*|keluhan|kecewa|marah|angry|refund|pengembalian dana|uang kembali|chargeback|penipuan|scam|fraud|tipu)\b/i,
  /\b(lawyer|pengacara|hukum|polisi|police|lapor|tuntut|sue|legal)\b/i,
]

/** The customer asked for a person, or raised a complaint or a legal/money matter: a person should answer. */
export function needsHuman(text: string): boolean {
  return ESCALATE.some((r) => r.test(text))
}

/** A teammate wrote to this contact within the last HUMAN_ACTIVE_MINUTES. Automatic replies do not count. */
export function humanRecentlyReplied(notes: { kind: string; body: string | null; occurred_at: string }[], now: number = Date.now()): boolean {
  const since = now - HUMAN_ACTIVE_MINUTES * 60_000
  return notes.some((n) => isHumanSent(n) && new Date(n.occurred_at).getTime() >= since)
}

/** Why an automatic reply must be held for review, or null when it may go out. */
export function holdReason(a: { latest: string; notes: { kind: string; body: string | null; occurred_at: string }[]; contactCount: number; accountCount: number; now?: number }): HoldReason | null {
  if (needsHuman(a.latest)) return "asked_for_human"
  if (humanRecentlyReplied(a.notes, a.now)) return "human_active"
  if (a.contactCount >= AUTO_PER_CONTACT_PER_HOUR || a.accountCount >= AUTO_PER_ACCOUNT_PER_HOUR) return "rate_limited"
  return null
}
