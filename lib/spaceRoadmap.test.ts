/**
 * Roadmap import planner (Phase 4): fixture 3 waves / 11 deliverables.
 * create → noop (idempotent) → update → conflict (no silent overwrite).
 */
import { describe, it, expect } from "vitest"
import { planWave, rowMarker, rowDescription, type RoadmapPhase } from "@/lib/spaceRoadmap"

const RID = "rm-1"

function milestone(id: string, title: string, description = "") {
  return { id, title, description }
}

const PHASES: RoadmapPhase[] = [
  {
    id: "w1",
    name: "Fondasi",
    timeframe: "Bulan 1",
    description: "",
    milestones: [milestone("m1", "Setup"), milestone("m2", "Akun"), milestone("m3", "Audit")],
  },
  {
    id: "w2",
    name: "Operasi",
    timeframe: "Bulan 2",
    description: "",
    milestones: [
      milestone("m4", "SOP kasir"),
      milestone("m5", "Stok"),
      milestone("m6", "Jadwal"),
      milestone("m7", "Training"),
    ],
  },
  {
    id: "w3",
    name: "Tumbuh",
    timeframe: "Bulan 3",
    description: "",
    milestones: [
      milestone("m8", "Iklan"),
      milestone("m9", "Loyalitas"),
      milestone("m10", "Kemitraan"),
      milestone("m11", "Cabang"),
    ],
  },
]

const row = (mid: string, title: string, desc = "") => ({
  marker: rowMarker(RID, mid),
  title,
  description: rowDescription(rowMarker(RID, mid), desc),
})

describe("planWave", () => {
  it("plans create for all 3 waves (11 deliverables)", () => {
    const plans = PHASES.map((p) => planWave(RID, p, null))
    expect(plans.every((p) => p.action === "create")).toBe(true)
    const total = plans.reduce((n, p) => (p.action === "create" ? n + p.rows.length : n), 0)
    expect(total).toBe(11)
  })

  it("is idempotent: second import is noop", () => {
    for (const phase of PHASES) {
      const existing = {
        docId: `doc-${phase.id}`,
        title: phase.name,
        updatedAt: "2026-09-17T10:00:00.000Z",
        lastImportAt: "2026-09-17T10:00:00.000Z",
        rows: phase.milestones.map((m) => row(m.id, m.title)),
      }
      expect(planWave(RID, phase, existing).action).toBe("noop")
    }
  })

  it("updates cleanly when the doc is untouched since import", () => {
    const phase = { ...PHASES[0], milestones: [...PHASES[0].milestones, milestone("m12", "Baru")] }
    const existing = {
      docId: "doc-w1",
      title: "Fondasi",
      updatedAt: "2026-09-17T10:00:00.000Z",
      lastImportAt: "2026-09-17T10:00:00.000Z",
      rows: PHASES[0].milestones.map((m) => row(m.id, m.title)),
    }
    const plan = planWave(RID, phase, existing)
    expect(plan.action).toBe("update")
    if (plan.action === "update") {
      expect(plan.toAdd.map((r) => r.milestoneId)).toEqual(["m12"])
      expect(plan.toUpdate).toEqual([])
    }
  })

  it("conflicts (no silent overwrite) when user edited since import", () => {
    const phase = { ...PHASES[0], milestones: [...PHASES[0].milestones, milestone("m12", "Baru")] }
    const existing = {
      docId: "doc-w1",
      title: "Fondasi (diubah user)",
      updatedAt: "2026-09-17T12:00:00.000Z",
      lastImportAt: "2026-09-17T10:00:00.000Z",
      rows: [...PHASES[0].milestones.map((m) => row(m.id, m.title)), row("x", "Catatan user")],
    }
    const plan = planWave(RID, phase, existing)
    expect(plan.action).toBe("conflict")
    if (plan.action === "conflict") {
      expect(plan.currentContent).toContain("Catatan user")
      expect(plan.wanted.length).toBe(4)
    }
  })

  it("matches rows by marker, not title (user renames don't duplicate)", () => {
    const existing = {
      docId: "doc-w1",
      title: "Fondasi",
      updatedAt: "2026-09-17T10:00:00.000Z",
      lastImportAt: null, // tak tercatat → anggap bersih, bukan conflict
      rows: PHASES[0].milestones.map((m, i) => (i === 0 ? row(m.id, "Setup (rename user)") : row(m.id, m.title))),
    }
    const plan = planWave(RID, PHASES[0], existing)
    expect(plan.action).toBe("update")
    if (plan.action === "update") {
      expect(plan.toAdd).toEqual([])
      expect(plan.toUpdate.map((r) => r.milestoneId)).toEqual(["m1"])
    }
  })
})
