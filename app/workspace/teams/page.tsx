"use client"

/**
 * Workspace › Teams (ADR-019 P1). The same manager lives in Settings → Team;
 * here it is one of the Workspace tabs (header in app/workspace/layout.tsx).
 */
import { TeamsManager } from "@/components/workspace/TeamsManager"

export default function TeamsPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[760px] px-4 py-8 sm:px-8">
        <TeamsManager />
      </div>
    </div>
  )
}
