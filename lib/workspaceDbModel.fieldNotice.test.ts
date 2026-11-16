import { describe, expect, it } from "vitest"
import { activeFilterCount, addedFieldPeople, fieldNoticeExcerpt, parseFieldNotice, type FieldDef } from "./workspaceDbModel"
import { inboxVerb } from "@/components/workspace/WorkspaceInbox"

const defs: FieldDef[] = [
  { id: "rev", name: "Reviewer", type: "person", options: [] },
  { id: "qa", name: "QA", type: "person", options: [] },
  { id: "txt", name: "Note", type: "text", options: [] },
]
const u = (id: string) => ({ kind: "user" as const, id })

describe("addedFieldPeople", () => {
  it("returns only people newly set, per person field", () => {
    const out = addedFieldPeople({ rev: [u("a")] }, { rev: [u("a"), u("b")], qa: [{ kind: "agent", type: "autonomous" }], txt: "x" }, defs)
    expect(out.map((f) => [f.fieldId, f.fieldName, f.added.map((p) => (p.kind === "user" ? p.id : p.type))])).toEqual([
      ["rev", "Reviewer", ["b"]],
      ["qa", "QA", ["autonomous"]],
    ])
  })
  it("treats a missing previous map as empty (new task) and ignores removals", () => {
    expect(addedFieldPeople(undefined, { rev: [u("a")] }, defs)).toHaveLength(1)
    expect(addedFieldPeople({ rev: [u("a")] }, { rev: [] }, defs)).toEqual([])
  })
})

describe("field notice excerpt", () => {
  it("round-trips field and title", () => {
    expect(parseFieldNotice(fieldNoticeExcerpt("Reviewer", "Ship\nit"))).toEqual({ field: "Reviewer", title: "Ship it" })
    expect(parseFieldNotice(fieldNoticeExcerpt("QA", "  "))).toEqual({ field: "QA", title: "Untitled" })
  })
  it("has no parts for a plain title", () => {
    expect(parseFieldNotice("Just a title")).toBeNull()
  })
  it("inbox copy names the field", () => {
    expect(inboxVerb("field_assigned", fieldNoticeExcerpt("Reviewer", "T"))).toBe("set you as Reviewer on a task")
    expect(inboxVerb("field_assigned", "x")).toBe("set you on a task field")
  })
})

describe("activeFilterCount", () => {
  it("counts non-All secondary filters including person fields", () => {
    expect(activeFilterCount({ priority: "All", due: "All", people: "All", fieldFilters: {} })).toBe(0)
    expect(activeFilterCount({ priority: "High", due: "Overdue", people: "me", fieldFilters: { rev: "me", qa: "All" } })).toBe(4)
  })
})
