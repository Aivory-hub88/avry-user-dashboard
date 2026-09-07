"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import WorkspaceEditor from "@/components/workspace/WorkspaceEditor"

export default function WorkspaceDocPage() {
  const params = useParams()
  const id = (params?.id as string) ?? "demo"

  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-6">
        <div className="flex items-center gap-2">
          <Link href="/workspace" className="text-[13px] text-white/40 hover:text-white/70">
            Workspace
          </Link>
          <span className="text-white/20">/</span>
          <span className="text-[13px] font-medium text-white/80">{id}</span>
        </div>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
          BlockSuite POC
        </span>
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="mx-auto w-full max-w-[760px] flex-1 overflow-y-auto px-8 py-8">
          <WorkspaceEditor docId={id} />
        </div>
      </div>
    </div>
  )
}
