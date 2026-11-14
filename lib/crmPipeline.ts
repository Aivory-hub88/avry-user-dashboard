/**
 * Pure helpers for the CRM pipeline and record pages (no React, unit-tested).
 *
 * The CRM's PATCH /companies|contacts|deals/:id replaces the whole record, so
 * every edit goes through the *Body builders below: they start from the
 * record as loaded and apply only the changed fields, so nothing the user did
 * not touch (stage, contacts, custom fields) is reset.
 */
import type { Company, Contact, Deal, DealStage } from "./crmClient"

export const OPEN_STAGES: readonly DealStage[] = ["lead", "qualified", "proposal"]

/** Rough win odds per stage for the weighted forecast. Closed stages count 0 (won is already counted as won). */
export const STAGE_PROBABILITY: Record<DealStage, number> = { lead: 0.1, qualified: 0.4, proposal: 0.7, won: 0, lost: 0 }

export type StageTotal = { count: number; value: number }

export function stageTotals(deals: Pick<Deal, "stage" | "value">[]): Record<DealStage, StageTotal> {
  const out: Record<DealStage, StageTotal> = {
    lead: { count: 0, value: 0 },
    qualified: { count: 0, value: 0 },
    proposal: { count: 0, value: 0 },
    won: { count: 0, value: 0 },
    lost: { count: 0, value: 0 },
  }
  for (const d of deals) {
    const t = out[d.stage]
    if (!t) continue
    t.count += 1
    t.value += d.value ?? 0
  }
  return out
}

export type PipelineSummary = { openValue: number; openCount: number; weighted: number; wonValue: number; wonCount: number }

export function pipelineSummary(deals: Pick<Deal, "stage" | "value">[]): PipelineSummary {
  const t = stageTotals(deals)
  const open = OPEN_STAGES.map((s) => t[s])
  return {
    openValue: open.reduce((n, x) => n + x.value, 0),
    openCount: open.reduce((n, x) => n + x.count, 0),
    weighted: Math.round(OPEN_STAGES.reduce((n, s) => n + t[s].value * STAGE_PROBABILITY[s], 0)),
    wonValue: t.won.value,
    wonCount: t.won.count,
  }
}

/**
 * The currency to show next to a sum: the one every valued deal shares, or
 * null when they differ or none is set (the sum is then shown bare).
 */
export function sharedCurrency(deals: Pick<Deal, "value" | "currency">[]): string | null {
  const set = new Set(deals.filter((d) => d.value !== null).map((d) => d.currency ?? ""))
  if (set.size !== 1) return null
  const [only] = set
  return only || null
}

export function formatMoney(v: number, currency: string | null): string {
  return `${currency ? `${currency} ` : ""}${v.toLocaleString("en-US")}`
}

/** Days until (negative: since) a YYYY-MM-DD close date, by local calendar day. */
export function daysUntil(date: string | null, now: Date = new Date()): number | null {
  if (!date) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return null
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

/** An open deal whose expected close date has passed. */
export function isPastClose(d: Pick<Deal, "stage" | "expected_close_date">, now: Date = new Date()): boolean {
  const n = daysUntil(d.expected_close_date, now)
  return n !== null && n < 0 && OPEN_STAGES.includes(d.stage)
}

const blankToNull = (v: string | null | undefined): string | null => {
  if (v === null || v === undefined) return null
  const t = v.trim()
  return t === "" ? null : t
}

export type CompanyChanges = Partial<Pick<Company, "name" | "domain" | "industry" | "size" | "custom_fields">>
export type ContactChanges = Partial<Pick<Contact, "name" | "email" | "phone" | "title" | "company_id" | "custom_fields">>
export type DealChanges = Partial<Pick<Deal, "title" | "value" | "currency" | "stage" | "company_id" | "contact_ids" | "expected_close_date" | "custom_fields">>

export function companyBody(c: Company, ch: CompanyChanges) {
  const n = { ...c, ...ch }
  return {
    name: n.name.trim(),
    domain: blankToNull(n.domain),
    industry: blankToNull(n.industry),
    size: blankToNull(n.size),
    custom_fields: n.custom_fields ?? {},
  }
}

export function contactBody(c: Contact, ch: ContactChanges) {
  const n = { ...c, ...ch }
  return {
    name: n.name.trim(),
    email: blankToNull(n.email),
    phone: blankToNull(n.phone),
    title: blankToNull(n.title),
    company_id: n.company_id || null,
    custom_fields: n.custom_fields ?? {},
  }
}

export function dealBody(d: Deal, ch: DealChanges) {
  const n = { ...d, ...ch }
  return {
    title: n.title.trim(),
    value: n.value,
    currency: blankToNull(n.currency),
    stage: n.stage,
    company_id: n.company_id || null,
    contact_ids: n.contact_ids ?? [],
    expected_close_date: n.expected_close_date || null,
    custom_fields: n.custom_fields ?? {},
  }
}

/** Custom field values are stored as JSON; the record page edits them as text. */
export function customFieldText(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  return JSON.stringify(v)
}

/** A new custom field name: trimmed, 1–40 chars, not already used. */
export function validFieldName(name: string, existing: Record<string, unknown>): string | null {
  const t = name.trim()
  if (t.length < 1 || t.length > 40) return null
  if (Object.prototype.hasOwnProperty.call(existing, t)) return null
  return t
}
