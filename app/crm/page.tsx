"use client"

/** CRM: companies, contacts and a deal pipeline, backed by the avry-crm service (via /api/crm). */
import CrmApp from "@/components/crm/CrmApp"

export default function CrmPage() {
  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-black/10 px-6 text-[13px]">
        <span className="font-medium text-white/85">CRM</span>
      </div>
      <CrmApp />
    </div>
  )
}
