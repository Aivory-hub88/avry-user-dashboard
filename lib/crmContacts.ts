/**
 * Pure helpers for the Contacts list: when each person was last contacted, their
 * next step, the built-in "smart views", saved views, and duplicate detection.
 */
import type { Activity, Contact } from "./crmClient"
import { whatsappDigits } from "./crmLabels"
import { isWhatsappNote } from "./crmWhatsapp"

/** Activity kinds that count as having actually spoken to the person (plain notes and tasks don't; WhatsApp messages, stored as notes, do). */
const CONTACT_KINDS = new Set(["call", "email", "meeting"])

const DAY_MS = 86_400_000

/** Most recent call/email/meeting per contact, ignoring ones dated in the future. */
export function lastContactMap(activities: (Pick<Activity, "kind" | "subject_type" | "subject_id" | "occurred_at"> & { body?: string | null })[], now: Date = new Date()): Map<string, string> {
  const m = new Map<string, string>()
  for (const a of activities) {
    if (a.subject_type !== "contact" || !(CONTACT_KINDS.has(a.kind) || isWhatsappNote({ kind: a.kind, body: a.body ?? null }))) continue
    const t = new Date(a.occurred_at).getTime()
    if (!Number.isFinite(t) || t > now.getTime()) continue
    const cur = m.get(a.subject_id)
    if (!cur || t > new Date(cur).getTime()) m.set(a.subject_id, a.occurred_at)
  }
  return m
}

/** Soonest open follow-up per contact. */
export function contactNextStep<T extends Pick<Activity, "subject_type" | "subject_id" | "due_at" | "completed_at">>(followUps: T[]): Map<string, T> {
  const m = new Map<string, T>()
  for (const a of followUps) {
    if (a.subject_type !== "contact" || !a.due_at || a.completed_at) continue
    const cur = m.get(a.subject_id)
    if (!cur || new Date(a.due_at) < new Date(cur.due_at as string)) m.set(a.subject_id, a)
  }
  return m
}

/** Whole local days since `iso` (0 = today); null when missing or unreadable. */
export function daysSince(iso: string | undefined | null, now: Date = new Date()): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.max(0, Math.round((b - a) / DAY_MS))
}

export function contactedLabel(days: number | null): string {
  if (days === null) return "Never"
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 30) return `${days} d ago`
  if (days < 365) return `${Math.floor(days / 30)} mo ago`
  return `${Math.floor(days / 365)} y ago`
}

export const STALE_DAYS = 7

export type SmartView = "all" | "stale" | "overdue" | "nostep"
export const SMART_VIEWS: { key: SmartView; label: string; hint: string }[] = [
  { key: "all", label: "All", hint: "Everyone" },
  { key: "stale", label: `Not contacted in ${STALE_DAYS}+ days`, hint: "Nobody has called, emailed or met them lately" },
  { key: "overdue", label: "Overdue follow-up", hint: "A follow-up is past its due date" },
  { key: "nostep", label: "No next step", hint: "Nothing is planned with them" },
]

export type ContactFacts = { lastContactDays: number | null; nextDueState: "none" | "overdue" | "today" | "upcoming" }

export function matchesView(view: SmartView, f: ContactFacts): boolean {
  if (view === "stale") return f.lastContactDays === null || f.lastContactDays >= STALE_DAYS
  if (view === "overdue") return f.nextDueState === "overdue"
  if (view === "nostep") return f.nextDueState === "none"
  return true
}

/** A named filter the user saved: a smart view plus an optional label. Stored per browser. */
export type SavedView = { id: string; name: string; view: SmartView; label: string | null }

export const MAX_SAVED_VIEWS = 8

export function isSavedView(v: unknown): v is SavedView {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return typeof o.id === "string" && typeof o.name === "string" && o.name.length > 0 && SMART_VIEWS.some((s) => s.key === o.view) && (o.label === null || typeof o.label === "string")
}

export function parseSavedViews(raw: string | null): SavedView[] {
  if (!raw) return []
  try {
    const j: unknown = JSON.parse(raw)
    return Array.isArray(j) ? j.filter(isSavedView).slice(0, MAX_SAVED_VIEWS) : []
  } catch {
    return []
  }
}

/** Dedupe key for a phone number: international digits, with a leading 0 read as Indonesia. */
export function phoneKey(phone: string | null | undefined): string | null {
  return whatsappDigits(phone)
}

export function emailKey(email: string | null | undefined): string | null {
  const t = email?.trim().toLowerCase()
  return t && t.includes("@") ? t : null
}

/** The existing contact that shares this email or phone, if any. Blank values never match. */
export function findDuplicate<T extends Pick<Contact, "email" | "phone">>(existing: T[], c: { email?: string | null; phone?: string | null }): { contact: T; by: "email" | "phone" } | null {
  const e = emailKey(c.email)
  const p = phoneKey(c.phone)
  for (const x of existing) {
    if (e && emailKey(x.email) === e) return { contact: x, by: "email" }
    if (p && phoneKey(x.phone) === p) return { contact: x, by: "phone" }
  }
  return null
}
