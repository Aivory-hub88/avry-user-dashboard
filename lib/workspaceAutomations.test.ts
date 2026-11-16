import { describe, it, expect, vi } from "vitest"
import * as Y from "yjs"

vi.mock("@/lib/db", () => ({ query: vi.fn() }))

import { applyRuleToRow, automatedFieldAdds, mergeFieldAdds, personCellWith, resolveRuleFieldTarget } from "./workspaceAutomations"
import { cellPeople, type FieldDef, type AutomationRule, type PersonRef } from "./workspaceDbModel"

const rev: FieldDef = { id: "rev", name: "Reviewer", type: "person", options: [] }
const qa: FieldDef = { id: "qa", name: "QA", type: "person", options: [], single: true }
const ann: PersonRef = { kind: "user", id: "u-ann", name: "Ann" }
const bob: PersonRef = { kind: "user", id: "u-bob", name: "Bob" }

function rowMap(extra: Record<string, unknown> = {}): Y.Map<unknown> {
  const doc = new Y.Doc()
  const arr = doc.getArray<Y.Map<unknown>>("database")
  const m = new Y.Map<unknown>()
  arr.push([m])
  for (const [k, v] of Object.entries({ id: "t", title: "T", status: "Review", cells: {}, owner: ann, createdBy: bob, ...extra })) m.set(k, v)
  return m
}
const rule = (to: string, fieldId = "rev"): AutomationRule => ({ id: "r", name: "n", whenStatus: "Review", setField: { fieldId, to } })

describe("personCellWith", () => {
  it("adds once to a multi field and dedupes", () => {
    expect(personCellWith([], ann, rev)).toEqual({ list: [ann], changed: true })
    expect(personCellWith([ann], ann, rev)).toEqual({ list: [ann], changed: false })
    expect(personCellWith([ann], bob, rev).list).toEqual([ann, bob])
  })
  it("stops at the cap of 5 without dropping anyone", () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ kind: "user", id: `u${i}` }) as PersonRef)
    expect(personCellWith(five, bob, rev)).toEqual({ list: five, changed: false })
  })
  it("replaces on a single field", () => {
    expect(personCellWith([ann], bob, qa)).toEqual({ list: [bob], changed: true })
    expect(personCellWith([ann], ann, qa).changed).toBe(false)
  })
})

describe("applyRuleToRow setField", () => {
  it("sets the owner, reports who was added and makes them a follower", () => {
    const m = rowMap()
    const applied = applyRuleToRow(m, rule("owner"), true, "x", [rev])
    expect(cellPeople((m.get("cells") as Record<string, never>).rev)).toEqual([ann])
    expect(applied.setField).toMatchObject({ fieldId: "rev", fieldName: "Reviewer", added: [ann] })
    expect((m.get("followers") as PersonRef[]).some((f) => f.kind === "user" && f.id === "u-ann")).toBe(true)
  })
  it("sets the creator and keeps other cells", () => {
    const m = rowMap({ cells: { note: "hi" } })
    applyRuleToRow(m, rule("creator"), true, "x", [rev])
    expect(m.get("cells")).toMatchObject({ note: "hi", rev: [bob] })
  })
  it("sets a fixed person or agent by key", () => {
    const m = rowMap()
    applyRuleToRow(m, rule("agent:autonomous"), true, "x", [rev])
    expect((m.get("cells") as Record<string, unknown>).rev).toEqual([{ kind: "agent", type: "autonomous" }])
  })
  it("is a no-op when the person is already there (no notice)", () => {
    const m = rowMap({ cells: { rev: [ann] } })
    const applied = applyRuleToRow(m, rule("owner"), true, "x", [rev])
    expect(applied.setField).toBeUndefined()
  })
  it("respects single-person: replaces, never holds two", () => {
    const m = rowMap({ cells: { qa: [bob] } })
    const applied = applyRuleToRow(m, rule("owner", "qa"), true, "x", [qa])
    expect((m.get("cells") as Record<string, unknown>).qa).toEqual([ann])
    expect(applied.setField?.added).toEqual([ann])
  })
  it("skips when the row has no owner, or the field is gone / not a person field", () => {
    const m = rowMap({ owner: null })
    expect(applyRuleToRow(m, rule("owner"), true, "x", [rev]).setField).toBeUndefined()
    expect(applyRuleToRow(rowMap(), rule("owner", "gone"), true, "x", [rev]).setField).toBeUndefined()
    expect(applyRuleToRow(rowMap(), rule("owner"), true, "x", [{ ...rev, type: "text" }]).setField).toBeUndefined()
    expect(m.get("cells")).toEqual({})
  })
  it("resolveRuleFieldTarget never makes an agent the owner", () => {
    expect(resolveRuleFieldTarget(rowMap({ owner: { kind: "agent", type: "autonomous" } }), "owner")).toBeNull()
  })
})

describe("mergeFieldAdds", () => {
  it("merges per field and dedupes people", () => {
    const a = [{ fieldId: "rev", fieldName: "Reviewer", added: [ann] }]
    const b = [{ fieldId: "rev", fieldName: "Reviewer", added: [ann, bob] }, { fieldId: "qa", fieldName: "QA", added: [bob] }]
    expect(mergeFieldAdds(a, b)).toEqual([
      { fieldId: "rev", fieldName: "Reviewer", added: [ann, bob] },
      { fieldId: "qa", fieldName: "QA", added: [bob] },
    ])
    expect(a[0].added).toEqual([ann])
  })
  it("automatedFieldAdds collects from applied rules", () => {
    expect(automatedFieldAdds([{ ruleId: "1", ruleName: "n" }, { ruleId: "2", ruleName: "m", setField: { fieldId: "rev", fieldName: "Reviewer", added: [ann] } }])).toHaveLength(1)
  })
})
