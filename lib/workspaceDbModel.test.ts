import { describe, expect, it } from "vitest"
import { parseFieldDefs, cleanCells, computeRollups, parseMentions, matchesDueFilter, matchRules, parseAutomationRules, type RollupSubject } from "./workspaceDbModel"


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
      users: [],
    })
  })

  it("extracts emails without confusing them for agents", () => {
    expect(parseMentions("cc @boss@example.com, @teo?")).toEqual({
      agents: ["customer_service"],
      emails: ["boss@example.com"],
      users: [],
    })
  })

  it("dedupes, caps, and ignores non-text", () => {
    expect(parseMentions("@lex @lex @nobody")).toEqual({ agents: ["leads_qualifier"], emails: [], users: [] })
    expect(parseMentions("")).toEqual({ agents: [], emails: [], users: [] })
    expect(parseMentions(null)).toEqual({ agents: [], emails: [], users: [] })
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

describe("parseAutomationRules", () => {
  it("keeps valid rules and drops action-less or nameless ones", () => {
    const rules = parseAutomationRules([
      { id: "a1", name: "Welcome", whenStatus: "Todo", setAssignee: "lex" },
      { id: "a2", name: "Empty", whenStatus: "Done" },
      { id: "a3", name: "", whenStatus: "Todo", addComment: "x" },
      { id: "a4", name: "Loop", whenStatus: "Doing", moveTo: "Doing" },
      { id: "a5", name: "Bad", whenStatus: "Archived", addComment: "x" },
    ])
    expect(rules.map((r) => r.id)).toEqual(["a1"])
  })

  it("matches entries into the trigger status only", () => {
    const rules = parseAutomationRules([{ id: "a1", name: "D", whenStatus: "Done", addComment: "nice" }])
    expect(matchRules(rules, "Doing", "Done")).toHaveLength(1)
    expect(matchRules(rules, "Done", "Done")).toHaveLength(0)
    expect(matchRules(rules, null, "Done")).toHaveLength(1)
    expect(matchRules(rules, "Todo", "Doing")).toHaveLength(0)
  })
})

import {
  cleanAssignees,
  cleanOwner,
  rowAssignees,
  unlinkedAssignee,
  addedAssignees,
  matchesPeopleFilter,
  cleanPeopleFilter,
  assigneesFromRuleValue,
  assigneeMirror,
} from "./workspaceDbModel"

describe("task people", () => {
  it("cleanAssignees drops junk, dedupes and caps at 5", () => {
    const raw = [
      { kind: "agent", type: "autonomous" },
      { kind: "agent", type: "autonomous" },
      { kind: "agent", type: "nope" },
      { kind: "user", id: "" },
      { kind: "user", id: "a", name: "A" },
      { kind: "user", id: "b" },
      { kind: "user", id: "c" },
      { kind: "user", id: "d" },
      { kind: "user", id: "e" },
    ]
    const out = cleanAssignees(raw)
    expect(out).toHaveLength(5)
    expect(out[0]).toEqual({ kind: "agent", type: "autonomous" })
    expect(out[1]).toEqual({ kind: "user", id: "a", name: "A" })
  })

  it("owner must be a person", () => {
    expect(cleanOwner({ kind: "agent", type: "autonomous" })).toBeNull()
    expect(cleanOwner({ kind: "user", id: "u1" })).toEqual({ kind: "user", id: "u1" })
  })

  it("reads legacy assignee text: agents typed, other text unlinked", () => {
    expect(rowAssignees(undefined, "autonomous")).toEqual([{ kind: "agent", type: "autonomous" }])
    expect(rowAssignees(undefined, "Geno")).toEqual([{ kind: "agent", type: "autonomous" }])
    expect(rowAssignees(undefined, "Budi")).toEqual([])
    expect(unlinkedAssignee(undefined, "Budi")).toBe("Budi")
    expect(unlinkedAssignee(undefined, "Geno")).toBe("")
    // Once typed, the legacy text is only a mirror.
    expect(rowAssignees([], "Budi")).toEqual([])
    expect(unlinkedAssignee([], "Budi")).toBe("")
  })

  it("addedAssignees diffs by key", () => {
    const a = { kind: "user", id: "a" } as const
    const g = { kind: "agent", type: "autonomous" } as const
    expect(addedAssignees([a], [a, g])).toEqual([g])
    expect(addedAssignees([a, g], [g])).toEqual([])
  })

  it("people filter: me matches assignee or owner", () => {
    const row = { assignees: [{ kind: "agent", type: "autonomous" } as const], owner: { kind: "user", id: "me" } as const }
    expect(matchesPeopleFilter(row, "me", "user:me")).toBe(true)
    expect(matchesPeopleFilter(row, "me", "user:other")).toBe(false)
    expect(matchesPeopleFilter(row, "agent:autonomous", null)).toBe(true)
    expect(matchesPeopleFilter(row, "unassigned", null)).toBe(false)
    expect(matchesPeopleFilter({ assignees: [], owner: null }, "unassigned", null)).toBe(true)
    expect(matchesPeopleFilter({ assignees: [], owner: null, unlinked: "Budi" }, "unassigned", null)).toBe(false)
  })

  it("cleanPeopleFilter accepts only known shapes", () => {
    expect(cleanPeopleFilter("me")).toBe("me")
    expect(cleanPeopleFilter("user:abc-1")).toBe("user:abc-1")
    expect(cleanPeopleFilter("agent:autonomous")).toBe("agent:autonomous")
    expect(cleanPeopleFilter("agent:ghost")).toBe("All")
    expect(cleanPeopleFilter(42)).toBe("All")
  })

  it("automation assign values", () => {
    expect(assigneesFromRuleValue("Geno")).toEqual([{ kind: "agent", type: "autonomous" }])
    expect(assigneesFromRuleValue("user:u1")).toEqual([{ kind: "user", id: "u1" }])
    expect(assigneesFromRuleValue("")).toEqual([])
    expect(assigneesFromRuleValue("Budi")).toBeNull()
  })

  it("mirror uses names", () => {
    expect(assigneeMirror([{ kind: "agent", type: "autonomous" }, { kind: "user", id: "u", name: "Rina" }])).toBe("Geno, Rina")
  })
})

import {
  mentionToken,
  mentionRefs,
  mentionSegments,
  mentionPlainText,
  tokenizeMentions,
  cleanFollowers,
  addFollowers,
  removeFollower,
  rowFollowers,
  hasPerson,
  rowChanges,
  cleanComment,
  MAX_FOLLOWERS,
} from "./workspaceDbModel"

describe("task mentions (P1)", () => {
  it("tokens round-trip through parseMentions", () => {
    const text = `hi ${mentionToken({ kind: "user", id: "u-1" }, "Rina [x]")} and ${mentionToken({ kind: "agent", type: "autonomous" }, "Geno")}`
    expect(text).toContain("[@Rina x](#member:u-1)")
    const p = parseMentions(text)
    expect(p.users).toEqual(["u-1"])
    expect(p.agents).toEqual(["autonomous"])
    expect(p.emails).toEqual([])
  })

  it("keeps legacy @agent and @email mentions next to tokens", () => {
    const p = parseMentions("ping @Geno and @rina@x.com and [@Budi](#member:b2)")
    expect(p.agents).toEqual(["autonomous"])
    expect(p.emails).toEqual(["rina@x.com"])
    expect(p.users).toEqual(["b2"])
  })

  it("drops tokens naming unknown agents", () => {
    expect(parseMentions("[@Ghost](#agent:ghost)").agents).toEqual([])
    expect(mentionSegments("[@Ghost](#agent:ghost)")).toEqual([{ kind: "text", text: "[@Ghost](#agent:ghost)" }])
  })

  it("mentionRefs lists typed refs only", () => {
    expect(mentionRefs("[@Rina](#member:u1) @Geno @a@b.co")).toEqual([
      { kind: "user", id: "u1" },
      { kind: "agent", type: "autonomous" },
    ])
  })

  it("segments and plain text", () => {
    const t = "Hey [@Rina](#member:u1), look"
    expect(mentionSegments(t)).toEqual([
      { kind: "text", text: "Hey " },
      { kind: "mention", ref: { kind: "user", id: "u1" }, label: "Rina" },
      { kind: "text", text: ", look" },
    ])
    expect(mentionPlainText(t)).toBe("Hey @Rina, look")
  })

  it("tokenizes picked names, longest first, once each", () => {
    const r = tokenizeMentions("@Ann Lee and @Ann and @Bob", [
      { ref: { kind: "user", id: "a" }, label: "Ann" },
      { ref: { kind: "user", id: "al" }, label: "Ann Lee" },
    ])
    expect(r.text).toBe("[@Ann Lee](#member:al) and [@Ann](#member:a) and @Bob")
    expect(r.mentions.map((m) => (m.kind === "user" ? m.id : ""))).toEqual(["al", "a"])
  })
})

describe("followers (P1)", () => {
  const me = { kind: "user", id: "me" } as const
  const geno = { kind: "agent", type: "autonomous" } as const

  it("legacy rows default to creator + owner + assignees", () => {
    expect(rowFollowers(undefined, { createdBy: me, owner: me, assignees: [geno] })).toEqual([me, geno])
    expect(rowFollowers([], { createdBy: me, owner: me, assignees: [geno] })).toEqual([])
  })

  it("add / remove / dedupe / cap", () => {
    const list = addFollowers([me], [geno, me, null, undefined])
    expect(list).toEqual([me, geno])
    expect(removeFollower(list, me)).toEqual([geno])
    expect(hasPerson(list, "user:me")).toBe(true)
    expect(hasPerson(list, null)).toBe(false)
    const many = Array.from({ length: 80 }, (_, i) => ({ kind: "user", id: `u${i}` }))
    expect(cleanFollowers(many)).toHaveLength(MAX_FOLLOWERS)
    expect(cleanFollowers([{ kind: "agent", type: "ghost" }, "x"])).toEqual([])
  })

  it("rowChanges reports status, due and owner", () => {
    const prev = { status: "Todo", due: "", owner: me }
    expect(rowChanges(prev, prev)).toEqual([])
    expect(rowChanges(prev, { status: "Done", due: "2026-11-20", owner: null })).toEqual([
      { kind: "status", from: "Todo", to: "Done" },
      { kind: "due", from: "", to: "2026-11-20" },
      { kind: "owner", from: me, to: null },
    ])
  })

  it("cleanComment keeps typed author and mentions", () => {
    expect(cleanComment({ id: "c1", text: "hi", author: "Rina", at: "t", authorRef: me, mentions: [geno, { kind: "agent", type: "ghost" }] })).toEqual({
      id: "c1",
      text: "hi",
      author: "Rina",
      at: "t",
      authorRef: me,
      mentions: [geno],
    })
    expect(cleanComment({ id: "c2", text: "old" })).toEqual({ id: "c2", text: "old", author: "", at: "" })
    expect(cleanComment({ text: "no id" })).toBeNull()
  })
})
