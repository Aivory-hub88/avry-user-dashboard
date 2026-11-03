"use client"

/**
 * Teams page (ADR-019 P1). The same manager lives in Settings → Team; this
 * route stays for deep links from the Workspace and Requests pages.
 */
import Link from "next/link"
import { TeamsManager } from "@/components/workspace/TeamsManager"

export default function TeamsPage() {
  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-black/10 px-6 text-[13px]">
        <Link href="/workspace/requests" className="text-white/40 hover:text-white/70">
          Requests
        </Link>
        <span className="text-white/20">/</span>
        <span className="font-medium text-white/80">Teams</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-8 py-8">
          <TeamsManager />
        </div>
      </div>
    </div>
  )
}
