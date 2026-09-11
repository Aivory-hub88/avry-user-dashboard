/**
 * Pure unit tests for the shared database-row plane (Fase 2):
 * row parsing caps + WIP gate logic. IO paths are covered live.
 */
import { describe, expect, it } from "vitest"
import * as Y from "yjs"
import {
  parseDbRow,
  wipExceeded,
  MAX_COMMENTS_PER_ROW,
  type DbRow,
} from "./workspaceDb"

function rowMap(fields: Record<string, unknown>): Y.Map<unknown> {
  // Y.Maps must live inside a doc transaction to be readable.
  const doc = new Y.Doc()
  const arr = doc.getArray<Y.Map<unknown>>("database")
  let out!: Y.Map<unknown>
  doc.transact(() => {
    out = new Y.Map<unknown>()
    for (const [k, v] of Object.entries(fields)) out.set(k, v)
    arr.push([out])
  })
  return out
}

function row(over: Partial<DbRow> = {}): DbRow {
  return {
    id: "r1",
    title: "t",
    status: "Todo",
    priority: "Med",
    assignee: "",
    due: "",
    description: "",
    comments: [],
    ...over,
  }
}

describe("parseDbRow", () => {
  it("fills defaults and normalizes priority", () => {
    const r = parseDbRow(rowMap({ id: "a" }))
    expect(r).toMatchObject({ id: "a", title: "", status: "Todo", priority: "Med", comments: [] })
    expect(parseDbRow(rowMap({ id: "a", priority: "Urgent" })).priority).toBe("Med")
  })

  it("caps comments and drops malformed entries", () => {
    const comments = Array.from({ length: MAX_COMMENTS_PER_ROW + 5 }, (_, i) => ({
      id: `c${i}`,
      text: "x",
      author: "u",
      at: "2026-09-11",
    }))
    const r = parseDbRow(rowMap({ id: "a", comments: [...comments, "junk", 42, null] }))
    expect(r.comments).toHaveLength(MAX_COMMENTS_PER_ROW)
  })

  it("caps description length", () => {
    const r = parseDbRow(rowMap({ id: "a", description: "x".repeat(9000) }))
    expect(r.description.length).toBeLessThanOrEqual(4000)
  })
})

describe("wipExceeded", () => {
  const rows = [row({ id: "a", status: "Todo" }), row({ id: "b", status: "Doing" })]

  it("returns null without a limit", () => {
    expect(wipExceeded(rows, "Todo", {})).toBeNull()
  })

  it("rejects moves into a full column", () => {
    expect(wipExceeded(rows, "Todo", { Todo: 1 })).toBe(1)
  })

  it("allows moves into columns with headroom", () => {
    expect(wipExceeded(rows, "Todo", { Todo: 2 })).toBeNull()
    expect(wipExceeded(rows, "Done", { Done: 1 })).toBeNull()
  })

  it("excludes the moved row itself", () => {
    expect(wipExceeded(rows, "Todo", { Todo: 1 }, "a")).toBeNull()
  })
})
