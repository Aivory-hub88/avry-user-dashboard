/** Shared look of timeline items (ADR-019 P6). Client-safe. */
import type { TimelineItem } from "@/lib/timeline"

export type KindFilter = "task" | "note" | "job" | "request"

export const FILTER_LABEL: Record<KindFilter, string> = {
  task: "Tasks",
  note: "Notes",
  job: "Agent jobs",
  request: "Requests",
}

/** Bar/chip classes by kind and task status. */
export function itemTone(item: TimelineItem): string {
  switch (item.kind) {
    case "task": {
      const s = (item.status ?? "").toLowerCase()
      if (s === "done") return "bg-emerald-400/[0.14] text-emerald-100/70 ring-1 ring-inset ring-emerald-300/20"
      if (s === "doing" || s.includes("progress")) return "bg-sky-400/[0.2] text-sky-50/90 ring-1 ring-inset ring-sky-300/30"
      return "bg-white/[0.09] text-white/80 ring-1 ring-inset ring-white/[0.12]"
    }
    case "note":
      return "bg-violet-400/[0.16] text-violet-50/90 ring-1 ring-inset ring-violet-300/25"
    case "job":
      return item.failed ? "bg-red-400/[0.14] text-red-100/85 ring-1 ring-inset ring-red-300/25" : "bg-white/[0.06] text-white/60 ring-1 ring-inset ring-white/[0.08]"
    case "request":
      return "bg-amber-400/[0.06] text-amber-100/80 border border-dashed border-amber-300/40"
    case "deadline":
      return "bg-amber-400/[0.18] text-amber-100 ring-1 ring-inset ring-amber-300/35"
  }
}

export function itemHref(item: TimelineItem): string | null {
  if (item.kind === "request" && item.requestId) return `/workspace/requests/${item.requestId}`
  if (!item.roomId) return null
  if (item.kind === "task") return `/workspace/${item.roomId}?tab=tasks`
  if (item.kind === "note" && item.noteId) return `/workspace/${item.roomId}?tab=notes&note=${item.noteId}`
  return `/workspace/${item.roomId}`
}

export function forLabel(item: TimelineItem, selfId: string | null): string {
  if (!item.forKind) return ""
  if (item.forKind === "member" && selfId && item.forId === selfId) return "For you"
  return item.forName ? `For ${item.forName}` : ""
}
