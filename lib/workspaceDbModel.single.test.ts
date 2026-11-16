import { describe, it, expect } from "vitest"
import {
  cleanCells,
  deleteStatusRefs,
  parseAutomationRules,
  parseFieldDefs,
  personCellLimit,
  personCellsProblem,
  cleanRuleFieldTarget,
  type FieldDef,
} from "./workspaceDbModel"

const multi: FieldDef = { id: "rev", name: "Reviewer", type: "person", options: [] }
const single: FieldDef = { ...multi, id: "qa", name: "QA", single: true }

describe("single-person fields", () => {
  it("parseFieldDefs keeps single only on person fields", () => {
    const defs = parseFieldDefs([
      { id: "a", name: "A", type: "person", options: [], single: true },
      { id: "b", name: "B", type: "person", options: [] },
      { id: "c", name: "C", type: "text", options: [], single: true },
      { id: "d", name: "D", type: "person", options: [], single: "yes" },
    ])
    expect(defs.map((d) => d.single)).toEqual([true, undefined, undefined, undefined])
  })

  it("personCellLimit is 1 for single, 5 otherwise", () => {
    expect(personCellLimit(single)).toBe(1)
    expect(personCellLimit(multi)).toBe(5)
  })

  it("personCellsProblem flags a second person as too_many only on a single field", () => {
    const two = ["user:u1", "user:u2"]
    expect(personCellsProblem({ qa: two }, [single])).toEqual({ fieldId: "qa", reason: "too_many" })
    expect(personCellsProblem({ qa: two }, [multi, { ...single, id: "other" }])).toBeNull()
    expect(personCellsProblem({ rev: two }, [multi])).toBeNull()
    expect(personCellsProblem({ qa: ["user:u1"] }, [single])).toBeNull()
    expect(personCellsProblem({ qa: [] }, [single])).toBeNull()
  })

  it("cleanCells keeps only the first person of a single field", () => {
    const out = cleanCells({ qa: ["user:u1", "user:u2"], rev: ["user:u1", "user:u2"] }, [single, multi])
    expect(out.qa).toEqual([{ kind: "user", id: "u1" }])
    expect(out.rev).toHaveLength(2)
  })
})

describe("setField automation rules", () => {
  const base = { id: "r1", name: "Reviewer on entry", whenStatus: "Review" }
  it("keeps owner / creator / a valid person key; drops junk", () => {
    expect(parseAutomationRules([{ ...base, setField: { fieldId: "rev", to: "owner" } }])[0].setField).toEqual({ fieldId: "rev", to: "owner" })
    expect(parseAutomationRules([{ ...base, setField: { fieldId: "rev", to: "creator" } }])[0].setField?.to).toBe("creator")
    expect(parseAutomationRules([{ ...base, setField: { fieldId: "rev", to: " user:u9 " } }])[0].setField?.to).toBe("user:u9")
    expect(parseAutomationRules([{ ...base, setField: { fieldId: "rev", to: "agent:autonomous" } }])[0].setField?.to).toBe("agent:autonomous")
    // Nothing else to do → the rule is dropped.
    expect(parseAutomationRules([{ ...base, setField: { fieldId: "rev", to: "nobody" } }])).toEqual([])
    expect(parseAutomationRules([{ ...base, setField: { fieldId: "", to: "owner" } }])).toEqual([])
    expect(parseAutomationRules([{ ...base, setField: "owner" }])).toEqual([])
  })

  it("with the room's fields the target must be a person field", () => {
    const r = [{ ...base, setField: { fieldId: "t", to: "owner" } }]
    expect(parseAutomationRules(r, undefined, [multi])).toEqual([])
    expect(parseAutomationRules(r, undefined, [{ id: "t", name: "T", type: "text", options: [] }])).toEqual([])
    expect(parseAutomationRules(r, undefined, [{ ...multi, id: "t" }])).toHaveLength(1)
  })

  it("a rule may combine setField with the other actions", () => {
    const [r] = parseAutomationRules([{ ...base, addComment: "hi", setField: { fieldId: "rev", to: "owner" } }])
    expect(r.addComment).toBe("hi")
    expect(r.setField).toBeDefined()
  })

  it("cleanRuleFieldTarget", () => {
    expect(cleanRuleFieldTarget("owner")).toBe("owner")
    expect(cleanRuleFieldTarget("user:")).toBe("")
    expect(cleanRuleFieldTarget(5)).toBe("")
  })

  it("deleting the move target keeps a rule that still sets a field", () => {
    const rule = { id: "r", name: "n", whenStatus: "A", moveTo: "B", setField: { fieldId: "rev", to: "owner" } }
    const out = deleteStatusRefs({ dbAutomations: [rule] }, "B", "A")
    expect(out.dbAutomations).toEqual([{ id: "r", name: "n", whenStatus: "A", setField: { fieldId: "rev", to: "owner" } }])
  })
})
