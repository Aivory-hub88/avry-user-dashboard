"use client"

import { useParams, useSearchParams } from "next/navigation"
import Link from "next/link"
import WorkspaceEditor from "@/components/workspace/WorkspaceEditor"
import WorkspaceDatabase from "@/components/workspace/WorkspaceDatabase"

export default function WorkspaceDocPage() {
  const params = useParams()
  const search = useSearchParams()
  const id = (params?.id as string) ?? "demo"
  const view = search.get("view") === "database" ? "database" : "page"

  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-6">
        <div className="flex items-center gap-2">
          <Link href="/workspace" className="text-[13px] text-white/40 hover:text-white/70">
            Workspace
          </Link>
          <span className="text-white/20">/</span>
          <span className="text-[13px] font-medium text-white/80">{id}</span>
          <div className="ml-3 flex items-center gap-1 rounded-full bg-white/[0.04] p-1">
            <Link
              href={`/workspace/${id}`}
              className={`rounded-full px-3 py-1 text-[12px] ${view === "page" ? "bg-white text-black" : "text-white/40 hover:text-white/70"}`}
            >
              Page
            </Link>
            <Link
              href={`/workspace/${id}?view=database`}
              className={`rounded-full px-3 py-1 text-[12px] ${view === "database" ? "bg-white text-black" : "text-white/40 hover:text-white/70"}`}
            >
              Database
            </Link>
          </div>
        </div>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
          BlockSuite POC
        </span>
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="mx-auto w-full max-w-[860px] flex-1 overflow-y-auto px-8 py-8">
          {view === "database" ? <WorkspaceDatabase docId={id} /> : <WorkspaceEditor docId={id} />}
        </div>
      </div>
    </div>
  )
}
