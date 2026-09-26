import { describe, it, expect } from "vitest"
import { tokenizeMentions, mentionedAgents, displayBody, personName, openTaskRows, type TimelineMessage } from "@/lib/roomChat"
import { parseSpaceMentions } from "@/lib/spaceProtocol"
import type { SpaceAgentTask } from "@/lib/spaceAgent"

const agents = [
  { type: "leads_qualifier", name: "Lex" },
  { type: "autonomous", name: "Geno" },
]

describe("tokenizeMentions", () => {
  it("turns composer @names into tokens the server stamps", () => {
    const t = tokenizeMentions("@Lex can you and @geno check this?", agents)
    expect(t).toBe("[@Lex](#agent:leads_qualifier) can you and [@Geno](#agent:autonomous) check this?")
    expect(parseSpaceMentions(t).agentTypes).toEqual(["leads_qualifier", "autonomous"])
    expect(mentionedAgents(t)).toEqual(["leads_qualifier", "autonomous"])
  })

  it("leaves emails, longer words and agents outside the room alone", () => {
    expect(tokenizeMentions("mail lex@acme.co or @Lexicon, ask @Finn", agents)).toBe("mail lex@acme.co or @Lexicon, ask @Finn")
  })

  it("doesn't double-tokenise", () => {
    const once = tokenizeMentions("@Lex hi", agents)
    expect(tokenizeMentions(once, agents)).toBe(once)
  })
})

describe("displayBody", () => {
  it("folds tokens back to labels", () => {
    expect(displayBody("[@Lex](#agent:leads_qualifier) see [#Plan](#doc:abc) [@here](#here)")).toBe("@Lex see #Plan @here")
  })
})

describe("personName", () => {
  it("prefers the full name, then the email's local part", () => {
    expect(personName("rina@acme.co", "Rina Hartono")).toBe("Rina Hartono")
    expect(personName("rina@acme.co")).toBe("rina")
    expect(personName("")).toBe("Someone")
  })
})

const task = (over: Partial<SpaceAgentTask>): SpaceAgentTask => ({
  id: "t1",
  spaceId: "room",
  threadRoot: "m1",
  triggerMsg: "m1",
  agentType: "leads_qualifier",
  instruction: "x",
  status: "todo",
  reason: "",
  resultMsg: null,
  approvalRef: {},
  createdBy: "user:u1",
  createdAt: "2026-09-26T10:00:00.000Z",
  updatedAt: "2026-09-26T10:00:00.000Z",
  ...over,
})

const agentMsg = (at: string): TimelineMessage => ({
  id: "a1",
  threadRoot: "m1",
  author: { memberId: "leads_qualifier", actingMode: "agent", agentName: "Lex", agentType: "leads_qualifier" },
  authorName: "Lex",
  body: "done",
  createdAt: at,
  replyTo: null,
})

describe("openTaskRows", () => {
  it("maps running, blocked and failed tasks; skips done", () => {
    const rows = openTaskRows(
      [task({ id: "a", status: "in_progress" }), task({ id: "b", status: "blocked" }), task({ id: "c", status: "done" }), task({ id: "d", status: "failed" })],
      [],
    )
    expect(rows.map((r) => `${r.kind}:${r.task.id}`)).toEqual(["thinking:a", "approval:b", "failed:d"])
  })

  it("hides a failure the same agent has since recovered from", () => {
    const rows = openTaskRows([task({ status: "failed", updatedAt: "2026-09-26T10:00:00.000Z" })], [agentMsg("2026-09-26T10:05:00.000Z")])
    expect(rows).toEqual([])
  })
})

describe("quoteText", () => {
  it("flattens markdown and tokens into one readable line", async () => {
    const { quoteText } = await import("@/lib/roomChat")
    expect(quoteText("I checked **Customer export.xlsx**:\n\n- 29 share an email\n- 12 share a phone\n\n[@Lex](#agent:leads_qualifier) `ok`"))
      .toBe("I checked Customer export.xlsx: 29 share an email 12 share a phone @Lex ok")
  })
})
