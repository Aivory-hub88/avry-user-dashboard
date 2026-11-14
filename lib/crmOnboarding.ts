/**
 * Pure helpers for CRM onboarding (no React, unit-tested): the sample
 * dataset, the setup checklist, the "what did agents do lately" banner, and
 * CSV import (parse, guess the column mapping, turn rows into records).
 */
import type { Activity, Company, Contact, Deal, DealStage, Grant } from "./crmClient"

// ── Sample data ────────────────────────────────────────────────────────────

/** Sample records carry this custom field, so they can be shown as sample and removed in one go. */
export const SAMPLE_FIELD = "Sample"
export const SAMPLE_VALUE = "yes"
const SAMPLE = { [SAMPLE_FIELD]: SAMPLE_VALUE }

export function isSample(r: { custom_fields?: Record<string, unknown> | null }): boolean {
  return r.custom_fields?.[SAMPLE_FIELD] === SAMPLE_VALUE
}

export type SampleCompany = { key: string; name: string; domain: string; industry: string; size: string }
export type SampleContact = { key: string; name: string; email: string; title: string; company: string }
export type SampleDeal = { title: string; value: number; stage: DealStage; company: string; contacts: string[]; closeInDays: number }
export type SampleActivity = { deal: string; kind: "note" | "call" | "email" | "task"; body: string; dueInDays: number | null }

export const SAMPLE_COMPANIES: SampleCompany[] = [
  { key: "northwind", name: "Northwind Roofing", domain: "northwind.example", industry: "Construction", size: "11-50" },
  { key: "tanjung", name: "Tanjung Foods", domain: "tanjungfoods.example", industry: "Food & beverage", size: "51-200" },
  { key: "atlas", name: "Atlas Fit", domain: "atlasfit.example", industry: "Fitness", size: "11-50" },
  { key: "cendana", name: "Cendana Hotel", domain: "cendana.example", industry: "Hospitality", size: "51-200" },
]

export const SAMPLE_CONTACTS: SampleContact[] = [
  { key: "dana", name: "Dana Pratt", email: "dana@northwind.example", title: "Operations lead", company: "northwind" },
  { key: "rafi", name: "Rafi Hakim", email: "rafi@northwind.example", title: "Owner", company: "northwind" },
  { key: "sari", name: "Sari Wulan", email: "sari@tanjungfoods.example", title: "Finance manager", company: "tanjung" },
  { key: "budi", name: "Budi Santoso", email: "budi@atlasfit.example", title: "Founder", company: "atlas" },
  { key: "maya", name: "Maya Lestari", email: "maya@cendana.example", title: "General manager", company: "cendana" },
]

export const SAMPLE_DEALS: SampleDeal[] = [
  { title: "Member onboarding", value: 7000, stage: "lead", company: "atlas", contacts: ["budi"], closeInDays: 45 },
  { title: "Guest concierge", value: 11500, stage: "lead", company: "cendana", contacts: ["maya"], closeInDays: 60 },
  { title: "Ops automation", value: 12000, stage: "qualified", company: "tanjung", contacts: ["sari"], closeInDays: 21 },
  { title: "Roof inspection reports", value: 9500, stage: "proposal", company: "northwind", contacts: ["dana", "rafi"], closeInDays: 7 },
  { title: "Quote follow-up bot", value: 2400, stage: "won", company: "northwind", contacts: ["dana"], closeInDays: -10 },
  { title: "Invoice reminders", value: 3000, stage: "lost", company: "tanjung", contacts: ["sari"], closeInDays: -20 },
]

export const SAMPLE_ACTIVITIES: SampleActivity[] = [
  { deal: "Roof inspection reports", kind: "email", body: "Sent the proposal: monthly inspection reports with photos sorted by roof section.", dueInDays: null },
  { deal: "Roof inspection reports", kind: "task", body: "Follow up with Dana on the proposal", dueInDays: 2 },
  { deal: "Ops automation", kind: "call", body: "Discovery call. Wants purchase orders to sync with their stock sheet.", dueInDays: null },
  { deal: "Member onboarding", kind: "task", body: "Book a demo with Budi", dueInDays: -1 },
]

export const sampleCustomFields = () => ({ ...SAMPLE })

/** YYYY-MM-DD `days` from `now`, in local time. */
export function dateInDays(days: number, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** A due time `days` from now at 10:00 local, as ISO. */
export function dueInDays(days: number, now: Date = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 10, 0).toISOString()
}

// ── Setup checklist ────────────────────────────────────────────────────────

export type ChecklistInput = { companies: Company[]; contacts: Contact[]; deals: Deal[]; activities: Activity[]; grants: Grant[] | null }
export type ChecklistItem = { key: "company" | "contact" | "deal" | "agent" | "activity"; label: string; done: boolean }

export function grantIsActive(g: Grant, now: Date = new Date()): boolean {
  return !g.revoked_at && new Date(g.expires_at).getTime() > now.getTime()
}

/** Sample records never count: the checklist is about the user's own data. */
export function setupChecklist(i: ChecklistInput, now: Date = new Date()): ChecklistItem[] {
  const real = <T extends { custom_fields?: Record<string, unknown> | null }>(xs: T[]) => xs.filter((x) => !isSample(x))
  const sampleIds = new Set([...i.companies, ...i.contacts, ...i.deals].filter(isSample).map((r) => r.id))
  return [
    { key: "company", label: "Add your first company", done: real(i.companies).length > 0 },
    { key: "contact", label: "Add a person you talk to", done: real(i.contacts).length > 0 },
    { key: "deal", label: "Create a deal", done: real(i.deals).length > 0 },
    { key: "agent", label: "Connect Lex", done: (i.grants ?? []).some((g) => grantIsActive(g, now)) },
    { key: "activity", label: "Log a call, email or note", done: i.activities.some((a) => !sampleIds.has(a.subject_id)) },
  ]
}

// ── Agent activity banner ─────────────────────────────────────────────────

export type AgentRecent = { records: number; activities: number; agents: string[] }

/** What agents created in the last `hours` (records with a created_at, and activities). */
export function agentRecent(
  i: { companies: Company[]; contacts: Contact[]; deals: Deal[]; activities: Activity[] },
  now: Date = new Date(),
  hours = 24,
): AgentRecent {
  const since = now.getTime() - hours * 3_600_000
  const recent = (iso: string | undefined) => !!iso && new Date(iso).getTime() >= since
  const agents = new Set<string>()
  let records = 0
  for (const r of [...i.companies, ...i.contacts, ...i.deals] as { owner_agent: string | null; created_at?: string }[]) {
    if (r.owner_agent && recent(r.created_at)) {
      records++
      agents.add(r.owner_agent)
    }
  }
  let activities = 0
  for (const a of i.activities) {
    if (a.owner_agent && recent(a.created_at)) {
      activities++
      agents.add(a.owner_agent)
    }
  }
  return { records, activities, agents: [...agents] }
}

// ── CSV import ────────────────────────────────────────────────────────────

export const MAX_IMPORT_ROWS = 200

/** RFC 4180-ish: quoted fields, "" escapes, commas/newlines inside quotes, CRLF, BOM. Detects ; or tab delimiters. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "")
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ""
  const count = (ch: string) => firstLine.split(ch).length - 1
  const delim = count("\t") > count(",") && count("\t") >= count(";") ? "\t" : count(";") > count(",") ? ";" : ","
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
      continue
    }
    if (c === '"' && field === "") quoted = true
    else if (c === delim) {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += c
  }
  if (field !== "" || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""))
}

export const IMPORT_FIELDS = ["name", "first_name", "last_name", "email", "phone", "title", "company", "domain", "industry"] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]

export const IMPORT_FIELD_LABEL: Record<ImportField, string> = {
  name: "Full name",
  first_name: "First name",
  last_name: "Last name",
  email: "Email",
  phone: "Phone",
  title: "Job title",
  company: "Company name",
  domain: "Company website",
  industry: "Industry",
}

const SYNONYMS: Record<ImportField, string[]> = {
  name: ["name", "fullname", "contactname", "contact", "person", "displayname", "nama", "namalengkap"],
  first_name: ["firstname", "givenname", "first"],
  last_name: ["lastname", "surname", "familyname", "last"],
  email: ["email", "emailaddress", "email1value", "mail", "primaryemail", "workemail"],
  phone: ["phone", "phonenumber", "mobile", "mobilephone", "phone1value", "telephone", "tel", "whatsapp", "telepon", "nohp"],
  title: ["title", "jobtitle", "position", "role", "organizationtitle", "organization1title", "jabatan"],
  company: ["company", "companyname", "organization", "organisation", "organizationname", "organization1name", "account", "accountname", "perusahaan"],
  domain: ["domain", "website", "companywebsite", "url", "companydomain", "web"],
  industry: ["industry", "sector", "industri"],
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "")

/** Column index → field, guessed from the header row. Each field is used at most once. */
export function guessMapping(header: string[]): (ImportField | null)[] {
  const used = new Set<ImportField>()
  return header.map((h) => {
    const n = norm(h)
    const hit = IMPORT_FIELDS.find((f) => !used.has(f) && SYNONYMS[f].includes(n))
    if (hit) used.add(hit)
    return hit ?? null
  })
}

export type ImportPlan = {
  companies: { name: string; domain: string | null; industry: string | null }[]
  contacts: { name: string; email: string | null; phone: string | null; title: string | null; company: string | null }[]
  skipped: number
}

const cleanCell = (v: string | undefined) => {
  const t = (v ?? "").trim()
  return t === "" ? null : t
}

/** Domain from a URL or bare host: "https://www.acme.com/x" → "acme.com". */
export function toDomain(v: string | null): string | null {
  if (!v) return null
  const host = v.trim().replace(/^[a-z]+:\/\//i, "").split(/[/?#]/)[0].replace(/^www\./i, "").toLowerCase()
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null
}

/**
 * Rows → companies (deduplicated by name, case-insensitive, skipping ones
 * that already exist) and contacts. A row with a company but no person
 * becomes just the company; a row with neither is skipped.
 */
export function buildImportPlan(rows: string[][], mapping: (ImportField | null)[], existingCompanies: string[] = []): ImportPlan {
  const col = (f: ImportField) => mapping.indexOf(f)
  const get = (r: string[], f: ImportField) => (col(f) >= 0 ? cleanCell(r[col(f)]) : null)
  const existing = new Set(existingCompanies.map((n) => n.trim().toLowerCase()))
  const companies = new Map<string, ImportPlan["companies"][number]>()
  const contacts: ImportPlan["contacts"] = []
  let skipped = 0
  for (const r of rows.slice(0, MAX_IMPORT_ROWS)) {
    const full = get(r, "name") ?? ([get(r, "first_name"), get(r, "last_name")].filter(Boolean).join(" ") || null)
    const company = get(r, "company")
    const email = get(r, "email")
    if (company && company.length >= 2) {
      const k = company.toLowerCase()
      if (!existing.has(k) && !companies.has(k)) companies.set(k, { name: company, domain: toDomain(get(r, "domain")), industry: get(r, "industry") })
    }
    const name = full ?? email
    if (name && name.length >= 2) {
      contacts.push({ name, email, phone: get(r, "phone"), title: get(r, "title"), company: company && company.length >= 2 ? company : null })
    } else if (!company) skipped++
  }
  skipped += Math.max(0, rows.length - MAX_IMPORT_ROWS)
  return { companies: [...companies.values()], contacts, skipped }
}
