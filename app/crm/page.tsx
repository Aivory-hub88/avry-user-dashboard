"use client"

/** CRM: deal pipeline, companies, contacts and activity, backed by the avry-crm service (via /api/crm). */
import { Suspense } from "react"
import CrmApp from "@/components/crm/CrmApp"

export default function CrmPage() {
  return (
    <Suspense fallback={<div className="h-full w-full bg-surface-1" />}>
      <CrmApp />
    </Suspense>
  )
}
