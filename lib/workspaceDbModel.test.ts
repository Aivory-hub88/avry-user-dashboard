import { describe, expect, it } from "vitest"
import { parseFieldDefs, cleanCells, computeRollups, parseMentions, matchesDueFilter, type RollupSubject } from "./workspaceDbModel"


describe("parseFieldDefs relation/rollup", () => {
  it("keeps valid relation + rollup chains", () => {
    const defs = parseFieldDefs([
      { id: "f-rel", name: "Project", type: "relation", targetDocId: "doc-proj" },
      { id: "f-roll", name: "Progress", type: "rollup", relationFieldId: "f-rel", rollupOp: "donePct" },
    ])
    expect(defs).toEqual([
      { id: "f-rel", name: "Project", type: "relation", options: [], targetDocId: "doc-proj" },
      { id: "f-roll", name: "Progress", type: "rollup", options: [], relationFieldId: "f-rel", rollupOp: "donePct" },
    ])
  })

  it("downgrades broken configs to text without dropping the column", () => {
    const defs = parseFieldDefs([
      { id: "f-bad-rel", name: "Nowhere", type: "relation", targetDocId: "" },
      { id: "f-bad-roll", name: "Orphan", type: "rollup", relationFieldId: "nope", rollupOp: "count" },
    ])
    expect(defs.map((d) => d.type)).toEqual(["text", "text"])
    expect(defs).toHaveLength(2)
  })
})

describe("cleanCells relation/rollup", () => {
  const defs = parseFieldDefs([
    { id: "f-rel", name: "R", type: "relation", targetDocId: "doc-x" },
    { id: "f-roll", name: "C", type: "rollup", relationFieldId: "f-rel", rollupOp: "count" },
  ])

  it("keeps id lists for relations and never stores rollups", () => {
    expect(cleanCells({ "f-rel": ["a", "b", 42, ""], "f-roll": 99 }, defs)).toEqual({ "f-rel": ["a", "b"] })
  })
})

describe("computeRollups", () => {
  const defs = parseFieldDefs([
    { id: "f-rel", name: "R", type: "relation", targetDocId: "doc-t" },
    { id: "f-cnt", name: "N", type: "rollup", relationFieldId: "f-rel", rollupOp: "count" },
    { id: "f-done", name: "%", type: "rollup", relationFieldId: "f-rel", rollupOp: "donePct" },
    { id: "f-sum", name: "S", type: "rollup", relationFieldId: "f-rel", rollupOp: "sum", rollupFieldId: "f-pts" },
  ])
  const rows: RollupSubject[] = [
    { id: "a", status: "Todo", cells: { "f-rel": ["t1", "t2", "ghost"] } },
    { id: "b", status: "Todo", cells: {} },
  ]
  const targets: RollupSubject[] = [
    { id: "t1", status: "Done", cells: { "f-pts": 5 } },
    { id: "t2", status: "Todo", cells: { "f-pts": "3" } },
  ]
  const get = (_doc: string) => targets

  it("counts, averages done-%, and sums readable links", () => {
    expect(computeRollups(rows, defs, get)).toEqual({
      a: { "f-cnt": 2, "f-done": 50, "f-sum": 8 },
    })
  })

  it("resolves null when the target is unreadable", () => {
    expect(computeRollups(rows, defs, () => null)).toEqual({
      a: { "f-cnt": null, "f-done": null, "f-sum": null },
    })
  })

  it("ignores rows without links", () => {
    const out = computeRollups([rows[1]], defs, get)
    expect(out).toEqual({})
  })
})

describe("parseMentions", () => {
  it("resolves agent names and types case-insensitively", () => {
    expect(parseMentions("Hey @Lex and @GENO, see @office_assistant")).toEqual({
      agents: ["leads_qualifier", "autonomous", "office_assistant"],
      emails: [],
    })
  })

  it("extracts emails without confusing them for agents", () => {
    expect(parseMentions("cc @boss@example.com, @teo?")).toEqual({
      agents: ["customer_service"],
      emails: ["boss@example.com"],
    })
  })

  it("dedupes, caps, and ignores non-text", () => {
    expect(parseMentions("@lex @lex @nobody")).toEqual({ agents: ["leads_qualifier"], emails: [] })
    expect(parseMentions("")).toEqual({ agents: [], emails: [] })
    expect(parseMentions(null)).toEqual({ agents: [], emails: [] })
  })
})

describe("matchesDueFilter", () => {
  const T = "2026-09-12"; // a Saturday
  it("matches each relative window", () => {
    expect(matchesDueFilter("", "Todo", "No date", T)).toBe(true)
    expect(matchesDueFilter("2026-09-10", "Todo", "Overdue", T)).toBe(true)
    expect(matchesDueFilter("2026-09-10", "Done", "Overdue", T)).toBe(false)
    expect(matchesDueFilter(T, "Todo", "Today", T)).toBe(true)
    expect(matchesDueFilter("2026-09-07", "Todo", "This week", T)).toBe(true) // Monday
    expect(matchesDueFilter("2026-09-13", "Todo", "This week", T)).toBe(true) // Sunday
    expect(matchesDueFilter("2026-09-14", "Todo", "This week", T)).toBe(false) // next Monday
    expect(matchesDueFilter("2026-09-19", "Todo", "Next 7 days", T)).toBe(true)
    expect(matchesDueFilter("2026-09-20", "Todo", "Next 7 days", T)).toBe(false)
    expect(matchesDueFilter("", "Todo", "All", T)).toBe(true)
  })
})
