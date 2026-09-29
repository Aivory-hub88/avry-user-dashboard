"use client"

/** Browser helpers for the CRM. Everything goes through /api/crm (see the proxy route). */
import { BASE_PATH } from "@/lib/asset"
import { collabAuthHeaders } from "@/lib/collabClient"

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
}
export type Contact = Owned & {
  id: string
  name: string
  email: string | null
  phone: string | null
  title: string | null
  company_id: string | null
  custom_fields: Record<string, unknown>
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
}

export class CrmError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function api<T>(path: string, init?: { method?: string; json?: unknown }): Promise<T> {
  const r = await fetch(`${BASE_PATH}/api/crm/${path}`, {
    method: init?.method ?? "GET",
    headers: { ...collabAuthHeaders(), ...(init?.json !== undefined ? { "Content-Type": "application/json" } : {}) },
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
  return j as T
}

const clean = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? null : v]))

export const crmApi = {
  companies: {
    list: () => api<Company[]>("companies"),
    create: (b: { name: string; domain?: string; industry?: string }) =>
      api<Company>("companies", { method: "POST", json: clean(b) }),
    remove: (id: string) => api(`companies/${id}`, { method: "DELETE" }),
  },
  contacts: {
    list: () => api<Contact[]>("contacts"),
    create: (b: { name: string; email?: string; title?: string; company_id?: string }) =>
      api<Contact>("contacts", { method: "POST", json: clean(b) }),
    remove: (id: string) => api(`contacts/${id}`, { method: "DELETE" }),
  },
  deals: {
    list: () => api<Deal[]>("deals"),
    create: (b: { title: string; value?: number; currency?: string; company_id?: string; contact_ids?: string[] }) =>
      api<Deal>("deals", { method: "POST", json: clean(b) }),
    setStage: (id: string, stage: DealStage) => api<Deal>(`deals/${id}/stage`, { method: "PATCH", json: { stage } }),
    remove: (id: string) => api(`deals/${id}`, { method: "DELETE" }),
  },
}
