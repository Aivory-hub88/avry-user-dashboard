import { describe, expect, it } from "vitest"
import { cellsMatchSearch, cleanSortField, compareFieldCells, fieldSortId, fieldSortValue, isSortableField, type PersonRef } from "./workspaceDbModel"

const u = (id: string, name: string): PersonRef => ({ kind: "user", id, name })

describe("custom-field sort values", () => {
  it("round-trips field ids and keeps built-ins", () => {
    expect(fieldSortId(fieldSortValue("f1"))).toBe("f1")
    expect(fieldSortId("title")).toBeNull()
    expect(cleanSortField("due")).toBe("due")
    expect(cleanSortField("field:abc_1")).toBe("field:abc_1")
    expect(cleanSortField("field:")).toBe("title")
    expect(cleanSortField("field:bad id!")).toBe("title")
    expect(cleanSortField("nope")).toBe("title")
    expect(cleanSortField(5)).toBe("title")
  })
  it("excludes relation and rollup fields", () => {
    expect(isSortableField({ type: "person" })).toBe(true)
    expect(isSortableField({ type: "relation" })).toBe(false)
    expect(isSortableField({ type: "rollup" })).toBe(false)
  })
})

describe("compareFieldCells", () => {
  const person = { type: "person" as const }
  it("sorts person cells by the first person's name, empty last in both directions", () => {
    const rows = [[u("2", "Zed")], [], [u("1", "Ann"), u("3", "Zoe")]]
    const sorted = (dir: "asc" | "desc") => [...rows].sort((a, b) => compareFieldCells(person, a, b, dir)).map((r) => r[0]?.kind === "user" ? r[0].name : "-")
    expect(sorted("asc")).toEqual(["Ann", "Zed", "-"])
    expect(sorted("desc")).toEqual(["Zed", "Ann", "-"])
  })
  it("sorts numbers numerically and text alphabetically", () => {
    expect(compareFieldCells({ type: "number" }, 10, 9, "asc")).toBeGreaterThan(0)
    expect(compareFieldCells({ type: "number" }, 10, 9, "desc")).toBeLessThan(0)
    expect(compareFieldCells({ type: "text" }, "a", "b", "asc")).toBeLessThan(0)
    expect(compareFieldCells({ type: "text" }, undefined, "b", "desc")).toBeGreaterThan(0)
  })
})

describe("cellsMatchSearch", () => {
  const defs = [{ id: "rev", type: "person" as const }, { id: "n", type: "text" as const }, { id: "rel", type: "relation" as const }]
  it("matches person names and text cells, case-insensitively via the lower-case needle", () => {
    const cells = { rev: [u("1", "Ayu Lestari")], n: "Contract draft", rel: ["ayu"] }
    expect(cellsMatchSearch(cells, defs, "ayu")).toBe(true)
    expect(cellsMatchSearch(cells, defs, "contract")).toBe(true)
    expect(cellsMatchSearch(cells, defs, "budi")).toBe(false)
    expect(cellsMatchSearch({ rel: ["ayu"] }, defs, "ayu")).toBe(false)
    expect(cellsMatchSearch(cells, defs, "")).toBe(true)
  })
})
