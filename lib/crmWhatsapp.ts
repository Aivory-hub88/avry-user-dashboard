/**
 * WhatsApp messages are stored as CRM notes (the CRM has no WhatsApp activity
 * kind) with a fixed prefix, so the contact list can tell them from ordinary notes.
 */
export const WA_IN = "WhatsApp received: "
export const WA_OUT = "WhatsApp sent: "

export const isWhatsappNote = (a: { kind: string; body: string | null }): boolean =>
  a.kind === "note" && !!a.body && (a.body.startsWith(WA_IN) || a.body.startsWith(WA_OUT))
