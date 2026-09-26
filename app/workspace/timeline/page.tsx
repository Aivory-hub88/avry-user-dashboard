"use client"

/**
 * Workspace › Timeline (ADR-019 P6): every room's tasks, deadlines, dated
 * notes and agent jobs on one calendar, plus requests still waiting for
 * approval. Each room also has its own Timeline tab.
 */
import Link from "next/link"
import ProjectTimeline from "@/components/timeline/ProjectTimeline"

export default function WorkspaceTimelinePage() {
  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-black/10 px-6 text-[13px]">
        <Link href="/workspace" className="text-white/40 hover:text-white/70">
          Workspace
        </Link>
        <span className="text-white/20">/</span>
        <span className="font-medium text-white/85">Timeline</span>
      </div>
      <ProjectTimeline />
    </div>
  )
}
