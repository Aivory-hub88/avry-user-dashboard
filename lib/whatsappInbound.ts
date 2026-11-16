/**
 * Turns inbound WhatsApp messages into CRM records: the contact is matched by
 * phone number (created when new), and the message is logged on it. The CRM is
 * injected so this stays testable. SERVER-ONLY (callers hold the CRM token).
 */
import type { Inbound } from "./kapso"
import { phoneKey } from "./crmContacts"
import { WA_IN } from "./crmWhatsapp"

export type ContactRow = { id: string; name: string; phone: string | null }
export type CrmPort = {
  listContacts(): Promise<ContactRow[]>
  createContact(b: { name: string; phone: string; custom_fields: Record<string, unknown> }): Promise<ContactRow>
  createActivity(b: { kind: "note"; subject_type: "contact"; subject_id: string; body: string }): Promise<unknown>
}

/** A message that was just logged, with the contact it landed on. */
export type LoggedEntry = { contactId: string; contactName: string; message: Inbound }
export type InboundResult = { logged: number; created: number; duplicates: number; entries: LoggedEntry[] }

/** Message ids already handled; Kapso retries a delivery that was not answered with 200. */
export class SeenIds {
  private m = new Map<string, number>()
  constructor(private ttlMs = 10 * 60_000, private max = 5000) {}
  has(id: string, now = Date.now()): boolean {
    const t = this.m.get(id)
    return t !== undefined && now - t < this.ttlMs
  }
  add(id: string, now = Date.now()) {
    if (this.m.size >= this.max) for (const k of [...this.m.keys()].slice(0, Math.ceil(this.max / 10))) this.m.delete(k)
    this.m.set(id, now)
  }
}

export async function logInbound(crm: CrmPort, msgs: Inbound[], seen: SeenIds): Promise<InboundResult> {
  const out: InboundResult = { logged: 0, created: 0, duplicates: 0, entries: [] }
  const fresh = msgs.filter((m) => !seen.has(m.id))
  out.duplicates = msgs.length - fresh.length
  if (fresh.length === 0) return out
  const byPhone = new Map<string, ContactRow>()
  for (const c of await crm.listContacts()) {
    const k = phoneKey(c.phone)
    if (k && !byPhone.has(k)) byPhone.set(k, c)
  }
  for (const m of fresh) {
    const key = phoneKey(`+${m.from}`) ?? m.from
    let contact = byPhone.get(key)
    if (!contact) {
      contact = await crm.createContact({ name: m.name ?? `+${m.from}`, phone: `+${m.from}`, custom_fields: { labels: ["WhatsApp"], source: "WhatsApp" } })
      byPhone.set(key, contact)
      out.created++
    }
    await crm.createActivity({ kind: "note", subject_type: "contact", subject_id: contact.id, body: `${WA_IN}${m.text}` })
    seen.add(m.id)
    out.logged++
    out.entries.push({ contactId: contact.id, contactName: contact.name, message: m })
  }
  return out
}
