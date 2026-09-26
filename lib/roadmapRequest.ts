/**
 * Roadmap → project request draft (ADR-019 P5). Pure, client-safe.
 *
 * "Make project" on a roadmap used to create an old-style project with wave
 * pages and a board. Now it prefills a request: the roadmap becomes the
 * goal, each milestone a row of the request's table (which becomes the
 * room's task board once approved).
 */
import { LIMITS, type DataTable, type RequestField } from "@/lib/projectRequests"

export const ROADMAP_DRAFT_KEY = "aivory:request-from-roadmap"

export interface RoadmapLike {
  title: string
  phases: { name: string; timeframe?: string; description?: string; milestones?: { title: string }[] }[]
}

export interface RequestDraft {
  title: string
  goal: string
  fields: RequestField[]
  dataTable: DataTable
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function roadmapToRequest(r: RoadmapLike): RequestDraft {
  const phases = r.phases.slice(0, 20)
  const lines = phases.map((p) => `- ${p.name}${p.timeframe ? ` (${p.timeframe})` : ""}${p.description ? `: ${p.description.trim()}` : ""}`)
  const goal = cut(`Deliver the "${r.title}" roadmap, phase by phase:\n${lines.join("\n")}`, LIMITS.goal)
  const rows: string[][] = []
  for (const p of phases) {
    for (const m of p.milestones ?? []) {
      if (rows.length >= LIMITS.rows) break
      rows.push([cut(m.title, LIMITS.cell), cut(p.name, LIMITS.cell), cut(p.timeframe ?? "", LIMITS.cell)])
    }
  }
  return {
    title: cut(r.title, LIMITS.title),
    goal,
    fields: [{ label: "Source", value: "Aivory roadmap" }],
    dataTable: rows.length ? { columns: ["Milestone", "Phase", "Timeframe"], rows } : { columns: [], rows: [] },
  }
}
