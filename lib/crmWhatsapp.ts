/**
 * WhatsApp messages are stored as CRM notes (the CRM has no WhatsApp activity
 * kind) with a fixed prefix, so the contact list and the timeline can tell them
 * from ordinary notes.
 */
export const WA_IN = "WhatsApp received: "
export const WA_OUT = "WhatsApp sent: "

type Noteish = { kind: string; body: string | null }

export const isWhatsappNote = (a: Noteish): boolean => a.kind === "note" && !!a.body && (a.body.startsWith(WA_IN) || a.body.startsWith(WA_OUT))

/** "in" for a message the person sent us, "out" for one we sent, null for anything else. */
export function whatsappDirection(a: Noteish): "in" | "out" | null {
  if (!isWhatsappNote(a)) return null
  return (a.body as string).startsWith(WA_IN) ? "in" : "out"
}

/** The message text without the storage prefix. */
export function whatsappText(body: string): string {
  return body.startsWith(WA_IN) ? body.slice(WA_IN.length) : body.startsWith(WA_OUT) ? body.slice(WA_OUT.length) : body
}

export const TEMPLATE_LINE = "\nTemplate: "
export const AUTO_LINE = "\nAuto-reply: "

/** A stored WhatsApp note split into the message and the small markers we append to it. */
export function whatsappParts(body: string): { text: string; template: string | null; auto: string | null } {
  let text = whatsappText(body)
  let auto: string | null = null
  let template: string | null = null
  const a = text.lastIndexOf(AUTO_LINE)
  if (a >= 0) {
    auto = text.slice(a + AUTO_LINE.length).trim() || null
    text = text.slice(0, a)
  }
  const t = text.lastIndexOf(TEMPLATE_LINE)
  if (t >= 0) {
    template = text.slice(t + TEMPLATE_LINE.length).trim() || null
    text = text.slice(0, t)
  }
  return { text, template, auto }
}

/** The body stored for a message we sent. `autoBy` names the agent when it was sent automatically. */
export function sentBody(text: string, opts: { template?: string; autoBy?: string } = {}): string {
  return `${WA_OUT}${text}${opts.template ? `${TEMPLATE_LINE}${opts.template}` : ""}${opts.autoBy ? `${AUTO_LINE}${opts.autoBy}` : ""}`
}

/** True for a message a person (not an automatic reply) sent from the CRM. */
export function isHumanSent(a: Noteish): boolean {
  return whatsappDirection(a) === "out" && whatsappParts(a.body as string).auto === null
}
