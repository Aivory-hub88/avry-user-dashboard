import { describe, it, expect } from "vitest"
import { DEFAULT_STATUSES, isCellFilled, missingOnDone, missingRequiredFields, parseFieldDefs, type FieldDef } from "./workspaceDbModel"

const f = (o: Partial<FieldDef> & Pick<FieldDef, "id" | "name" | "type">): FieldDef => ({ options: [], ...o })
const doneName = DEFAULT_STATUSES.find((s) => s.group === "done")!.name
const todoName = DEFAULT_STATUSES.find((s) => s.group === "todo")!.name

describe("requiredForDone on field defs", () => {
  it("is kept on every type but rollups", () => {
    const defs = parseFieldDefs([
      { id: "a", name: "A", type: "text", requiredForDone: true },
      { id: "b", name: "B", type: "person", requiredForDone: true, single: true },
      { id: "c", name: "C", type: "number" },
      { id: "r", name: "Roll", type: "relation", targetDocId: "t", requiredForDone: true },
      { id: "s", name: "Sum", type: "rollup", relationFieldId: "r", rollupOp: "count", requiredForDone: true },
      { id: "d", name: "D", type: "text", requiredForDone: "yes" },
    ])
    expect(defs.map((d) => [d.id, d.requiredForDone])).toEqual([
      ["a", true],
      ["b", true],
      ["c", undefined],
      ["r", true],
      ["s", undefined],
      ["d", undefined],
    ])
  })
})

describe("isCellFilled", () => {
  it("treats 0 as filled, blank text / false checkbox / empty lists as empty", () => {
    expect(isCellFilled({ type: "number" }, 0)).toBe(true)
    expect(isCellFilled({ type: "number" }, undefined)).toBe(false)
    expect(isCellFilled({ type: "text" }, "  ")).toBe(false)
    expect(isCellFilled({ type: "text" }, "x")).toBe(true)
    expect(isCellFilled({ type: "checkbox" }, false)).toBe(false)
    expect(isCellFilled({ type: "checkbox" }, true)).toBe(true)
    expect(isCellFilled({ type: "multi" }, [])).toBe(false)
    expect(isCellFilled({ type: "multi" }, ["A"])).toBe(true)
    expect(isCellFilled({ type: "relation" }, [])).toBe(false)
    expect(isCellFilled({ type: "person" }, [])).toBe(false)
    expect(isCellFilled({ type: "person" }, [{ kind: "user", id: "u" }])).toBe(true)
    expect(isCellFilled({ type: "date" }, "2026-01-01")).toBe(true)
    expect(isCellFilled({ type: "select" }, "")).toBe(false)
  })
})

describe("missingRequiredFields / missingOnDone", () => {
  const defs = [f({ id: "a", name: "A", type: "text", requiredForDone: true }), f({ id: "b", name: "B", type: "person", requiredForDone: true }), f({ id: "c", name: "C", type: "text" })]
  it("lists only required, empty fields", () => {
    expect(missingRequiredFields(defs, {})).toEqual([{ id: "a", name: "A" }, { id: "b", name: "B" }])
    expect(missingRequiredFields(defs, { a: "x", b: [{ kind: "user", id: "u" }] })).toEqual([])
  })
  it("only reports when a task enters the done group", () => {
    expect(missingOnDone(DEFAULT_STATUSES, defs, todoName, doneName, {})).toHaveLength(2)
    expect(missingOnDone(DEFAULT_STATUSES, defs, doneName, doneName, {})).toEqual([])
    expect(missingOnDone(DEFAULT_STATUSES, defs, doneName, todoName, {})).toEqual([])
  })
})
