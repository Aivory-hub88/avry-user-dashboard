/**
 * Labels, lead source and phone helpers for the CRM (pure, unit-tested).
 *
 * The CRM service has no dedicated tag column, so labels and lead source live in
 * the record's free-form `custom_fields` under reserved keys. The record page
 * hides those keys from the generic "custom fields" list and edits them with
 * proper controls instead.
 */

export const LABELS_KEY = "labels"
export const SOURCE_KEY = "source"
export const RESERVED_FIELD_KEYS: readonly string[] = [LABELS_KEY, SOURCE_KEY]

export const MAX_LABELS = 12
export const MAX_LABEL_LENGTH = 24

/** Where a lead came from. Sales teams report on this more than on almost any other field. */
export const SOURCES = ["Referral", "WhatsApp", "Instagram", "Website", "Event", "Cold outreach", "Marketplace", "Other"] as const

/** Suggested labels shown before the user has created any of their own. */
export const SUGGESTED_LABELS = ["Hot", "Warm", "Cold", "Decision maker", "VIP", "Follow up", "Partner"] as const

type Fields = Record<string, unknown> | null | undefined

export function normalizeLabel(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim().replace(/^#/, "").trim()
  if (t.length < 1) return null
  return t.slice(0, MAX_LABEL_LENGTH)
}

export function getLabels(fields: Fields): string[] {
  const v = fields?.[LABELS_KEY]
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) {
    if (typeof x !== "string") continue
    const n = normalizeLabel(x)
    if (n && !out.some((o) => o.toLowerCase() === n.toLowerCase())) out.push(n)
  }
  return out
}

export function getSource(fields: Fields): string {
  const v = fields?.[SOURCE_KEY]
  return typeof v === "string" ? v : ""
}

/** The labels with `raw` added (case-insensitive de-dupe, capped). Returns the same list when nothing changes. */
export function addLabel(labels: string[], raw: string): string[] {
  const n = normalizeLabel(raw)
  if (!n || labels.length >= MAX_LABELS) return labels
  if (labels.some((l) => l.toLowerCase() === n.toLowerCase())) return labels
  return [...labels, n]
}

export function removeLabel(labels: string[], label: string): string[] {
  return labels.filter((l) => l.toLowerCase() !== label.toLowerCase())
}

/** `custom_fields` with labels replaced; the key is dropped when the list is empty. */
export function withLabels(fields: Fields, labels: string[]): Record<string, unknown> {
  const next = { ...(fields ?? {}) }
  if (labels.length) next[LABELS_KEY] = labels
  else delete next[LABELS_KEY]
  return next
}

export function withSource(fields: Fields, source: string): Record<string, unknown> {
  const next = { ...(fields ?? {}) }
  if (source.trim()) next[SOURCE_KEY] = source.trim()
  else delete next[SOURCE_KEY]
  return next
}

/** Every label in use across records, most used first, for suggestions and filter chips. */
export function labelCounts(records: { custom_fields?: Fields }[]): { label: string; count: number }[] {
  const m = new Map<string, { label: string; count: number }>()
  for (const r of records) {
    for (const l of getLabels(r.custom_fields)) {
      const k = l.toLowerCase()
      const cur = m.get(k)
      if (cur) cur.count += 1
      else m.set(k, { label: l, count: 1 })
    }
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

export function hasLabel(fields: Fields, label: string): boolean {
  return getLabels(fields).some((l) => l.toLowerCase() === label.toLowerCase())
}

/** A stable hue (0-359) per label so the same label always gets the same dot colour. */
export function labelHue(label: string): number {
  let h = 0
  for (const ch of label.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

/**
 * Digits for a wa.me link. A leading 0 is read as an Indonesian number (0812… -> 62812…);
 * a leading + or an already-international number is kept as is. Null when it can't be a phone number.
 */
export function whatsappDigits(phone: string | null | undefined): string | null {
  if (!phone) return null
  const raw = phone.trim()
  let d = raw.replace(/\D/g, "")
  if (d.length < 7 || d.length > 15) return null
  if (raw.startsWith("+")) return d
  if (d.startsWith("00")) d = d.slice(2)
  else if (d.startsWith("0")) d = `62${d.slice(1)}`
  return d.length >= 7 && d.length <= 15 ? d : null
}

export function whatsappHref(phone: string | null | undefined): string | null {
  const d = whatsappDigits(phone)
  return d ? `https://wa.me/${d}` : null
}

/** `tel:` target: keeps a leading + and digits only. */
export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null
  const raw = phone.trim()
  const d = raw.replace(/\D/g, "")
  if (d.length < 5) return null
  return `tel:${raw.startsWith("+") ? "+" : ""}${d}`
}

/** A phone number a person could plausibly dial: 7-15 digits once spaces, dashes and brackets are ignored. */
export function isPlausiblePhone(phone: string): boolean {
  const t = phone.trim()
  if (!/^[+\d][\d\s().-]*$/.test(t)) return false
  const n = t.replace(/\D/g, "").length
  return n >= 7 && n <= 15
}
