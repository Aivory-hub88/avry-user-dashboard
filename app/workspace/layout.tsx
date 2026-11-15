"use client"

/**
 * Workspace section shell: one header (WorkspaceNav) over Rooms, Requests,
 * Timeline and Teams, kept mounted while switching between them. Room and
 * request detail pages keep their own header with a way back.
 */
import { usePathname } from "next/navigation"
import WorkspaceNav, { isWorkspaceSection } from "@/components/workspace/WorkspaceNav"

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (!isWorkspaceSection(pathname)) return <>{children}</>
  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <WorkspaceNav />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
