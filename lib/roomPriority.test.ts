import { describe, expect, it } from "vitest"
import { rankTargets, roleScore } from "./roomPriority"

const room = [
  { type: "autonomous", name: "Geno", title: "Generalist" },
  { type: "leads_qualifier", name: "Lex", title: "Sales and Lead Agent" },
  { type: "finance_invoice_ops", name: "Finn", title: "Finance & Invoice Ops" },
  { type: "marketing_content", name: "Nara", title: "Content Agent" },
  { type: "data_analyst", name: "Ivo", title: "Data Analyst" },
]
const targets = room.map((c) => c.type)

describe("rankTargets", () => {
  it("puts the agents the user named first, then the floor holder, then role matches", () => {
    const r = rankTargets({ text: "@Finn @Lex tolong cek budget iklan", targets, candidates: room, floor: "marketing_content" })
    const order = Object.entries(r).sort((a, b) => a[1] - b[1]).map(([t]) => t)
    expect(order.slice(0, 3)).toEqual(["finance_invoice_ops", "leads_qualifier", "marketing_content"])
  })

  it("ranks by role match for a plain @all", () => {
    const r = rankTargets({ text: "oke bagaimana bio dan hook posting threads-nya @all", targets, candidates: room })
    expect(r.marketing_content).toBe(0)
  })

  it("keeps room order when nothing matches, and never drops anyone", () => {
    const r = rankTargets({ text: "halo semua", targets, candidates: room })
    expect(Object.keys(r).sort()).toEqual([...targets].sort())
    expect(targets.map((t) => r[t])).toEqual([0, 1, 2, 3, 4])
  })

  it("does not treat @all as naming everyone", () => {
    const r = rankTargets({ text: "@all siapa yang urus invoice", targets, candidates: room })
    expect(r.finance_invoice_ops).toBe(0)
  })
})

describe("roleScore", () => {
  it("counts role words in Indonesian and English", () => {
    const lex = room[1]
    expect(roleScore("update pipeline dan lead baru", lex)).toBeGreaterThanOrEqual(2)
    expect(roleScore("cuaca hari ini cerah", lex)).toBe(0)
  })
})
