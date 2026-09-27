/** Room context for agent turns (ADR-019 P3): brief, task board from Yjs, relevant file excerpts. */
import { describe, it, expect, vi, beforeEach } from "vitest"
import * as Y from "yjs"

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))
vi.mock("@/lib/db", () => ({ query: queryMock }))

import { loadRoomContext } from "@/lib/roomContext"
import { dbRowToYMap } from "@/lib/workspaceDb"

function boardUpdate(): Buffer {
  const doc = new Y.Doc()
  doc.getArray<Y.Map<unknown>>("database").push([
    dbRowToYMap({ id: "a", title: "Acme", status: "Todo", priority: "High", assignee: "", start: "", due: "", description: "", comments: [], cells: { rq1: "Jakarta" } }),
    dbRowToYMap({ id: "b", title: "Beta Corp", status: "Done", priority: "Med", assignee: "Rina", start: "", due: "2026-11-01", description: "", comments: [], cells: {} }),
  ])
  return Buffer.from(Y.encodeStateAsUpdate(doc))
}

beforeEach(() => {
  queryMock.mockReset()
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes("SELECT id, title, props FROM dashboard.workspace_docs"))
      return Promise.resolve({
        rows: [
          {
            id: "workspace:room-1",
            title: "Odoo rollout",
            props: {
              brief: { goal: "Move CRM to Odoo", deadline: "2026-11-30", priority: "High", fields: [{ label: "Budget", value: "IDR 50m" }] },
              dbFields: [{ id: "rq1", name: "City", type: "text", options: [] }],
            },
          },
        ],
      })
    if (sql.includes("SELECT id, yjs_update FROM dashboard.workspace_docs"))
      return Promise.resolve({ rows: [{ id: "workspace:room-1", yjs_update: boardUpdate() }] })
    if (sql.includes("FROM dashboard.workspace_files"))
      return Promise.resolve({ rows: [{ id: "f1", name: "SOP.pdf", status: "ingested" }, { id: "f2", name: "export.csv", status: "ingested" }] })
    if (sql.includes("FROM dashboard.workspace_chunks"))
      return Promise.resolve({
        rows: [
          { row_id: "file:f1:0", text: "Standard operating procedure for the migration." },
          { row_id: "file:f1:1", text: "Customers are imported before quotations are enabled." },
          { row_id: "file:f2:0", text: "Customer,City\nAcme,Jakarta" },
          { row_id: "file:gone:0", text: "chunk of a deleted file" },
        ],
      })
    return Promise.resolve({ rows: [] })
  })
})

describe("loadRoomContext", () => {
  it("builds the brief and the task board with custom fields", async () => {
    const c = await loadRoomContext("room-1", "anything")
    expect(c?.brief).toBe("Project: Odoo rollout\nGoal: Move CRM to Odoo\nDeadline: 2026-11-30\nPriority: High\nBudget: IDR 50m")
    expect(c?.tasks).toBe("- Acme (Todo, High priority, City: Jakarta)\n- Beta Corp (Done, assigned to Rina, due 2026-11-01)")
    expect(c?.files).toBe("- SOP.pdf\n- export.csv")
  })

  it("picks the excerpts that match the instruction, never from deleted files", async () => {
    const c = await loadRoomContext("room-1", "when are customers imported?")
    expect(c?.excerpts[0]).toEqual({ file: "SOP.pdf", text: "Customers are imported before quotations are enabled." })
    expect(c?.excerpts.some((e) => e.text.includes("deleted"))).toBe(false)
  })

  it("falls back to each file's opening when nothing matches", async () => {
    const c = await loadRoomContext("room-1", "zzz")
    expect(c?.excerpts.map((e) => e.file)).toEqual(["SOP.pdf", "export.csv"])
  })

  it("returns null for an unknown room", async () => {
    queryMock.mockImplementation(() => Promise.resolve({ rows: [] }))
    expect(await loadRoomContext("nope", "x")).toBeNull()
  })
})

describe("room notes in agent context (P6)", () => {
  it("puts notes for this agent first and labels date and addressee", async () => {
    const base = queryMock.getMockImplementation()!
    queryMock.mockImplementation((sql: string, params: unknown[]) => {
      if (sql.includes("FROM dashboard.room_notes")) {
        expect(params[1]).toBe("sales_agent")
        return Promise.resolve({
          rows: [
            { title: "Chase invoice", body: "Ask Acme", on_date: "2026-10-02", for_kind: "agent", for_id: "sales_agent", for_name: "Sales" },
            { title: "Kickoff", body: "Agenda", on_date: null, for_kind: "member", for_id: "u2", for_name: "Rina" },
          ],
        })
      }
      return base(sql, params)
    })
    const c = await loadRoomContext("room-1", "anything", "sales_agent")
    expect(c!.notes).toContain("## Chase invoice (for you, 2 Oct 2026)")
    expect(c!.notes).toContain("## Kickoff (for Rina)")
  })
})
