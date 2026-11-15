"use client"

/**
 * Workspace › Timeline (ADR-019 P6): every room's tasks, deadlines, dated
 * notes and agent jobs on one calendar, plus requests still waiting for
 * approval. Each room also has its own Timeline tab. The header comes from
 * app/workspace/layout.tsx.
 */
import ProjectTimeline from "@/components/timeline/ProjectTimeline"

export default function WorkspaceTimelinePage() {
  return <ProjectTimeline />
}
