/** Shared CRM labels, colours and links. */
import type { DealStage } from "@/lib/crmClient"
import type { SubjectType } from "@/lib/crmActivity"

export const STAGE_LABEL: Record<DealStage, string> = {
  lead: "Lead",
  qualified: "Qualified",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
}

export const STAGE_DOT: Record<DealStage, string> = {
  lead: "bg-white/40",
  qualified: "bg-sky-400",
  proposal: "bg-amber-400",
  won: "bg-emerald-400",
  lost: "bg-red-400/70",
}

export type CrmTab = "deals" | "companies" | "contacts" | "activity"
export const CRM_TABS: readonly CrmTab[] = ["deals", "companies", "contacts", "activity"]

/** `/crm?tab=…` for a list, `/crm/<type>/<id>` for a record. */
export function crmHref(tabOrType: CrmTab | string, id?: string): string {
  if (id) return `/crm/${tabOrType as SubjectType}/${id}`
  return tabOrType === "deals" ? "/crm" : `/crm?tab=${tabOrType}`
}
