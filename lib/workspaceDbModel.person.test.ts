import { describe, expect, it } from "vitest"
import {
  parseFieldDefs,
  cleanCells,
  readCells,
  cleanAssignees,
  personCellsProblem,
  personRefFromKey,
  cellPeople,
  cellText,
  matchesPersonCellFilter,
  cleanFieldFilters,
  MAX_PERSON_CELL,
} from "./workspaceDbModel"

const defs = parseFieldDefs([
  { id: "f-rev", name: "Reviewer", type: "person" },
  { id: "f-tags", name: "Tags", type: "multi", options: ["x"] },
])
const ann = { kind: "user", id: "u-1", name: "Ann" } as const
const agent = { kind: "agent", type: "autonomous" } as const

describe("person field defs", () => {
  it("parses the person type with no options", () => {
    expect(defs[0]).toEqual({ id: "f-rev", name: "Reviewer", type: "person", options: [] })
  })
})

describe("cleanCells person", () => {
  it("keeps refs, accepts keys, dedupes and drops junk", () => {
    const out = cleanCells({ "f-rev": [ann, "user:u-1", "agent:autonomous", { kind: "agent", type: "nope" }, 7] }, defs)
    expect(out["f-rev"]).toEqual([ann, agent])
  })

  it("caps at MAX_PERSON_CELL", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ kind: "user", id: `u${i}` }))
    expect((cleanCells({ "f-rev": many }, defs)["f-rev"] as unknown[]).length).toBe(MAX_PERSON_CELL)
  })

  it("wraps a single ref and clears on null", () => {
    expect(cleanCells({ "f-rev": ann }, defs)["f-rev"]).toEqual([ann])
    expect(cleanCells({ "f-rev": null }, defs)["f-rev"]).toEqual([])
  })
})

describe("readCells person", () => {
  it("keeps stored ref lists and string lists apart", () => {
    const out = readCells({ "f-rev": [ann, { kind: "bogus" }], "f-tags": ["x"] })
    expect(out["f-rev"]).toEqual([ann])
    expect(out["f-tags"]).toEqual(["x"])
  })
})

describe("cleanAssignees is unchanged", () => {
  it("still ignores key strings", () => {
    expect(cleanAssignees(["user:u-1", ann])).toEqual([ann])
  })
})

describe("personCellsProblem", () => {
  it("accepts refs, keys, empty and null", () => {
    expect(personCellsProblem({ "f-rev": [ann, "agent:autonomous"] }, defs)).toBeNull()
    expect(personCellsProblem({ "f-rev": [] }, defs)).toBeNull()
    expect(personCellsProblem({ "f-rev": null }, defs)).toBeNull()
    expect(personCellsProblem({ "f-tags": "anything" }, defs)).toBeNull()
  })

  it("rejects bad shapes and too many people", () => {
    expect(personCellsProblem({ "f-rev": "user:u-1" }, defs)).toEqual({ fieldId: "f-rev", reason: "shape" })
    expect(personCellsProblem({ "f-rev": ["Ann"] }, defs)).toEqual({ fieldId: "f-rev", reason: "shape" })
    expect(personCellsProblem({ "f-rev": [{ kind: "agent", type: "nope" }] }, defs)).toEqual({ fieldId: "f-rev", reason: "shape" })
    const six = Array.from({ length: 6 }, (_, i) => `user:u${i}`)
    expect(personCellsProblem({ "f-rev": six }, defs)).toEqual({ fieldId: "f-rev", reason: "too_many" })
  })
})

describe("person helpers", () => {
  it("personRefFromKey", () => {
    expect(personRefFromKey("user:u-1")).toEqual({ kind: "user", id: "u-1" })
    expect(personRefFromKey("agent:autonomous")).toEqual(agent)
    expect(personRefFromKey("agent:nope")).toBeNull()
    expect(personRefFromKey("Ann")).toBeNull()
  })

  it("cellPeople reads only ref lists", () => {
    expect(cellPeople([ann])).toEqual([ann])
    expect(cellPeople(["x"])).toEqual([])
    expect(cellPeople("Ann")).toEqual([])
    expect(cellPeople(undefined)).toEqual([])
  })

  it("cellText shows names for person cells", () => {
    expect(cellText({ type: "person" }, [ann, agent])).toMatch(/^Ann, \S+/)
    expect(cellText({ type: "person" }, [])).toBe("")
    expect(cellText({ type: "multi" }, ["x", "y"])).toBe("x, y")
    expect(cellText({ type: "number" }, 3)).toBe("3")
  })

  it("matchesPersonCellFilter", () => {
    expect(matchesPersonCellFilter([ann], "All", null)).toBe(true)
    expect(matchesPersonCellFilter([ann], "me", "user:u-1")).toBe(true)
    expect(matchesPersonCellFilter([ann], "me", "user:u-2")).toBe(false)
    expect(matchesPersonCellFilter([ann], "me", null)).toBe(false)
    expect(matchesPersonCellFilter([], "unassigned", null)).toBe(true)
    expect(matchesPersonCellFilter([ann], "unassigned", null)).toBe(false)
    expect(matchesPersonCellFilter([agent], "agent:autonomous", null)).toBe(true)
  })

  it("cleanFieldFilters keeps valid non-All filters only", () => {
    expect(cleanFieldFilters({ "f-rev": "me", "f-qa": "All", "f-x": "user:u-1", "f-bad": "agent:nope", "f-n": 3 })).toEqual({
      "f-rev": "me",
      "f-x": "user:u-1",
    })
    expect(cleanFieldFilters(null)).toEqual({})
    expect(cleanFieldFilters(["me"])).toEqual({})
  })
})
