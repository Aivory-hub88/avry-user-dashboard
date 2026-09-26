import { describe, it, expect } from "vitest"
import { roadmapToRequest } from "@/lib/roadmapRequest"
import { cleanRequestInput, LIMITS } from "@/lib/projectRequests"

describe("roadmapToRequest", () => {
  const roadmap = {
    title: "AI rollout",
    phases: [
      { name: "Foundations", timeframe: "Month 1", description: "Data clean-up", milestones: [{ title: "Clean CRM" }, { title: "Pick tools" }] },
      { name: "Pilot", timeframe: "Month 2-3", milestones: [{ title: "Lead scoring pilot" }] },
    ],
  }

  it("turns phases into the goal and milestones into table rows", () => {
    const d = roadmapToRequest(roadmap)
    expect(d.title).toBe("AI rollout")
    expect(d.goal).toBe('Deliver the "AI rollout" roadmap, phase by phase:\n- Foundations (Month 1): Data clean-up\n- Pilot (Month 2-3)')
    expect(d.dataTable).toEqual({
      columns: ["Milestone", "Phase", "Timeframe"],
      rows: [["Clean CRM", "Foundations", "Month 1"], ["Pick tools", "Foundations", "Month 1"], ["Lead scoring pilot", "Pilot", "Month 2-3"]],
    })
  })

  it("stays within the request limits, so the server accepts it", () => {
    const big = { title: "x".repeat(500), phases: [{ name: "P", milestones: Array.from({ length: 400 }, (_, i) => ({ title: `m${i}` })) }] }
    const d = roadmapToRequest(big)
    expect(d.dataTable.rows).toHaveLength(LIMITS.rows)
    expect(cleanRequestInput(d).ok).toBe(true)
  })
})
