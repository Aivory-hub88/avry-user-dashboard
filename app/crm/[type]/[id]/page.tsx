"use client"

/** /crm/company/:id, /crm/contact/:id, /crm/deal/:id — one CRM record as a page. */
import { notFound, useParams } from "next/navigation"
import RecordPage from "@/components/crm/RecordPage"
import type { SubjectType } from "@/lib/crmActivity"

const TYPES = new Set<SubjectType>(["company", "contact", "deal"])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function CrmRecordRoute() {
  const { type, id } = useParams<{ type: string; id: string }>()
  if (!TYPES.has(type as SubjectType) || !UUID.test(id)) notFound()
  return <RecordPage key={`${type}:${id}`} type={type as SubjectType} id={id} />
}
