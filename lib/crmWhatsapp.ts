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
