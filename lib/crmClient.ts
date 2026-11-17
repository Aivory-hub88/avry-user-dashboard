"use client"

/** Browser helpers for the CRM. Everything goes through /api/crm (see the proxy route). */
import { BASE_PATH } from "@/lib/asset"
import { authedFetch } from "@/lib/deployAuth"
import type { ActivityKind, SubjectType } from "@/lib/crmActivity"
import { collectPages, NEXT_CURSOR_HEADER, pageQuery } from "@/lib/crmPaging"
import { companyBody, contactBody, dealBody, type CompanyChanges, type ContactChanges, type DealChanges } from "@/lib/crmPipeline"

export const DEAL_STAGES = ["lead", "qualified", "proposal", "won", "lost"] as const
export type DealStage = (typeof DEAL_STAGES)[number]

type Owned = { owner_agent: string | null; owner_user_id: string | null }
export type Company = Owned & {
  id: string
  name: string
  domain: string | null
  industry: string | null
  size: string | null
  custom_fields: Record<string, unknown>
  archived_at?: string | null
  created_at?: string
}
export type Contact = Owned & {
  id: string
  name: string
  email: string | null
  phone: string | null
  title: string | null
  company_id: string | null
  custom_fields: Record<string, unknown>
  archived_at?: string | null
  created_at?: string
}
export type Deal = Owned & {
  id: string
  title: string
  value: number | null
  currency: string | null
  stage: DealStage
  company_id: string | null
  contact_ids: string[]
  expected_close_date: string | null
  custom_fields: Record<string, unknown>
  archived_at?: string | null
  created_at?: string
  updated_at?: string
}

export type Activity = Owned & {
  id: string
  kind: ActivityKind
  subject_type: SubjectType
  subject_id: string
  body: string | null
  occurred_at: string
  due_at: string | null
  completed_at: string | null
  created_at: string
}

export type Grant = {
  id: string
  label: string
  agent: string
  scopes: string[]
  created_at: string
  expires_at: string
  last_used_at: string | null
  revoked_at: string | null
}
/** `token` is returned exactly once, on creation. */
export type CreatedGrant = Grant & { token: string }

export class CrmError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function api<T>(path: string, init?: { method?: string; json?: unknown }): Promise<T> {
  return (await call<T>(path, init)).data
}

/** Every row of a paged list (see lib/crmPaging). */
function listAll<T>(path: string, filters?: URLSearchParams): Promise<T[]> {
  return collectPages((cursor) => call<T[]>(`${path}?${pageQuery(filters, cursor)}`))
}

async function call<T>(path: string, init?: { method?: string; json?: unknown }): Promise<{ data: T; next: string | null }> {
  // authedFetch refreshes an expired token once, and opens the session-expired notice when it can't.
  const r = await authedFetch(`${BASE_PATH}/api/crm/${path}`, {
    method: init?.method ?? "GET",
    body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
  })
  const text = await r.text()
  let j: unknown = {}
  try {
    j = text ? JSON.parse(text) : {}
  } catch {
    // Non-JSON bodies (HTML error pages, plain-text validation) are never shown to the user.
  }
  if (!r.ok) {
    const fromJson = typeof (j as { error?: unknown })?.error === "string" ? (j as { error: string }).error : null
    const message =
      r.status === 401
        ? "Your session has expired. Sign in again."
        : r.status >= 502
          ? "The CRM is unavailable right now. Try again shortly."
          : (fromJson ?? "Something went wrong. Try again.")
    throw new CrmError(r.status, message)
  }
  return { data: j as T, next: r.headers.get(NEXT_CURSOR_HEADER) }
}

const clean = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? null : v]))

export const crmApi = {
  companies: {
    list: () => listAll<Company>("companies"),
    create: (b: { name: string; domain?: string | null; industry?: string | null; size?: string; custom_fields?: Record<string, unknown> }) =>
      api<Company>("companies", { method: "POST", json: clean(b) }),
    get: (id: string) => api<Company>(`companies/${id}`),
    /** PATCH replaces the whole record; `companyBody` keeps every field not in `ch`. */
    update: (c: Company, ch: CompanyChanges) => api<Company>(`companies/${c.id}`, { method: "PATCH", json: companyBody(c, ch) }),
    remove: (id: string) => api(`companies/${id}`, { method: "DELETE" }),
    archived: () => api<Company[]>("companies/archived"),
    setArchived: (id: string, archived: boolean) => api(`companies/${id}/archive`, { method: "PATCH", json: { archived } }),
  },
  contacts: {
    list: () => listAll<Contact>("contacts"),
    create: (b: { name: string; email?: string | null; phone?: string | null; title?: string | null; company_id?: string; custom_fields?: Record<string, unknown> }) =>
      api<Contact>("contacts", { method: "POST", json: clean(b) }),
    get: (id: string) => api<Contact>(`contacts/${id}`),
    update: (c: Contact, ch: ContactChanges) => api<Contact>(`contacts/${c.id}`, { method: "PATCH", json: contactBody(c, ch) }),
    remove: (id: string) => api(`contacts/${id}`, { method: "DELETE" }),
    archived: () => api<Contact[]>("contacts/archived"),
    setArchived: (id: string, archived: boolean) => api(`contacts/${id}/archive`, { method: "PATCH", json: { archived } }),
  },
  deals: {
    list: () => listAll<Deal>("deals"),
    create: (b: {
      title: string
      value?: number
      currency?: string
      stage?: DealStage
      company_id?: string
      contact_ids?: string[]
      expected_close_date?: string
      custom_fields?: Record<string, unknown>
    }) =>
      api<Deal>("deals", { method: "POST", json: clean(b) }),
    get: (id: string) => api<Deal>(`deals/${id}`),
    update: (d: Deal, ch: DealChanges) => api<Deal>(`deals/${d.id}`, { method: "PATCH", json: dealBody(d, ch) }),
    setStage: (id: string, stage: DealStage) => api<Deal>(`deals/${id}/stage`, { method: "PATCH", json: { stage } }),
    remove: (id: string) => api(`deals/${id}`, { method: "DELETE" }),
    archived: () => api<Deal[]>("deals/archived"),
    setArchived: (id: string, archived: boolean) => api(`deals/${id}/archive`, { method: "PATCH", json: { archived } }),
  },
  activities: {
    list: (q: { subject_type?: SubjectType; subject_id?: string; has_due?: boolean; completed?: boolean } = {}) => {
      const p = new URLSearchParams()
      if (q.subject_type) p.set("subject_type", q.subject_type)
      if (q.subject_id) p.set("subject_id", q.subject_id)
      if (q.has_due !== undefined) p.set("has_due", String(q.has_due))
      if (q.completed !== undefined) p.set("completed", String(q.completed))
      return listAll<Activity>("activities", p)
    },
    create: (b: { kind: ActivityKind; subject_type: SubjectType; subject_id: string; body?: string; due_at?: string | null }) =>
      api<Activity>("activities", { method: "POST", json: clean(b) }),
    complete: (id: string, completed = true) => api<Activity>(`activities/${id}`, { method: "PATCH", json: { completed } }),
    remove: (id: string) => api(`activities/${id}`, { method: "DELETE" }),
  },
  grants: {
    list: () => api<Grant[]>("grants"),
    create: (b: { label?: string; scopes?: string[]; expires_in_days?: number }) =>
      api<CreatedGrant>("grants", { method: "POST", json: b }),
    revoke: (id: string) => api(`grants/${id}`, { method: "DELETE" }),
  },
}
