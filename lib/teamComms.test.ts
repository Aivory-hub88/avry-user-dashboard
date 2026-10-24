import { describe, it, expect } from "vitest"
import {
  TEAM_MAX_DEPTH,
  TEAM_MAX_PER_AGENT,
  TEAM_MAX_TURNS,
  dueAtIso,
  droppedNote,
  parseTeamActions,
  planTeamActions,
  reminderFireAt,
  teamActionMessage,
  teamTurnInstruction,
} from "./teamComms"

const team = [
  { type: "leads_qualifier", name: "Lex" },
  { type: "customer_service", name: "Teo" },
  { type: "finance_invoice_ops", name: "Fina" },
]
const base = { depth: 0, usedPerAgent: { leads_qualifier: 1 }, usedTotal: 1 }
const NOW = Date.parse("2026-10-24T10:00:00Z")

describe("parseTeamActions", () => {
  it("keeps well-formed actions and drops the rest", () => {
    expect(
      parseTeamActions([
        { kind: "ask", to: "Teo", text: "Status tiket Alvin?" },
        { kind: "shout", to: "Teo", text: "x" },
        { kind: "message", to: "", text: "x" },
        "nope",
        { kind: "remind", to: "self", text: "cek invoice", when: "in 2h" },
      ]),
    ).toEqual([
      { kind: "ask", to: "Teo", text: "Status tiket Alvin?" },
      { kind: "remind", to: "self", text: "cek invoice", when: "in 2h" },
    ])
    expect(parseTeamActions(null)).toEqual([])
  })
})

describe("planTeamActions", () => {
  it("resolves names and starts a turn for ask / delegate / handoff", () => {
    const { planned, dropped } = planTeamActions(
      [
        { kind: "ask", to: "Teo", text: "Tiket Alvin?" },
        { kind: "delegate", to: "fina", text: "Buat invoice", due: "2026-11-01" },
      ],
      team,
      "leads_qualifier",
      base,
      NOW,
    )
    expect(dropped).toEqual([])
    expect(planned).toEqual([
      { kind: "ask", target: "customer_service", text: "Tiket Alvin?", runs: true },
      {
        kind: "delegate",
        target: "finance_invoice_ops",
        text: "Buat invoice",
        dueAt: "2026-11-01T23:59:59.000Z",
        runs: true,
      },
    ])
  })

  it("drops strangers and self, and says why", () => {
    const { planned, dropped } = planTeamActions(
      [
        { kind: "ask", to: "Ghost", text: "?" },
        { kind: "handoff", to: "Lex", text: "take it" },
      ],
      team,
      "leads_qualifier",
      base,
      NOW,
    )
    expect(planned).toEqual([])
    expect(dropped.map((d) => d.reason)).toEqual(["Ghost is not in this room", "an agent cannot message itself"])
    expect(droppedNote(dropped)).toContain("Not sent")
  })

  it("bounds turns by depth, total and per agent, but still delivers plain messages", () => {
    const deep = planTeamActions(
      [
        { kind: "ask", to: "Teo", text: "?" },
        { kind: "message", to: "Teo", text: "fyi" },
      ],
      team,
      "leads_qualifier",
      { ...base, depth: TEAM_MAX_DEPTH },
      NOW,
    )
    expect(deep.planned).toEqual([{ kind: "message", target: "customer_service", text: "fyi" }])
    expect(deep.dropped[0].reason).toContain("depth")

    const full = planTeamActions([{ kind: "ask", to: "Teo", text: "?" }], team, "leads_qualifier",
      { ...base, usedTotal: TEAM_MAX_TURNS }, NOW)
    expect(full.dropped[0].reason).toContain("turn limit")

    const tired = planTeamActions([{ kind: "ask", to: "Teo", text: "?" }], team, "leads_qualifier",
      { ...base, usedPerAgent: { customer_service: TEAM_MAX_PER_AGENT } }, NOW)
    expect(tired.dropped[0].reason).toContain("already took")
  })

  it("turns an ask to a busy teammate into a note instead of a second turn", () => {
    const { planned } = planTeamActions([{ kind: "ask", to: "Teo", text: "?" }], team, "leads_qualifier",
      { ...base, busy: ["customer_service"] }, NOW)
    expect(planned).toEqual([{ kind: "message", target: "customer_service", text: "?" }])
  })

  it("schedules reminders for self within 1 minute to 30 days", () => {
    const { planned, dropped } = planTeamActions(
      [
        { kind: "remind", to: "self", text: "cek invoice", when: "in 2h" },
        { kind: "remind", to: "Teo", text: "follow up", when: "in 31d" },
      ],
      team,
      "leads_qualifier",
      base,
      NOW,
    )
    expect(planned).toEqual([
      { kind: "remind", target: "leads_qualifier", text: "cek invoice", fireAt: "2026-10-24T12:00:00.000Z" },
    ])
    expect(dropped[0].reason).toContain("30 days")
  })

  it("carries out at most three actions per turn", () => {
    const many = Array.from({ length: 4 }, (_, i) => ({ kind: "message" as const, to: "Teo", text: `n${i}` }))
    const { planned, dropped } = planTeamActions(many, team, "leads_qualifier", base, NOW)
    expect(planned).toHaveLength(3)
    expect(dropped).toHaveLength(1)
  })
})

describe("time parsing", () => {
  it("reads relative and absolute reminder times", () => {
    expect(reminderFireAt("in 30m", NOW)).toBe(NOW + 30 * 60_000)
    expect(reminderFireAt("in 2 jam", NOW)).toBe(NOW + 120 * 60_000)
    expect(reminderFireAt("in 3d", NOW)).toBe(NOW + 3 * 1440 * 60_000)
    expect(reminderFireAt("2026-10-25T09:00:00Z", NOW)).toBe(Date.parse("2026-10-25T09:00:00Z"))
    expect(reminderFireAt("besok", NOW)).toBeNull()
    expect(dueAtIso("bad")).toBeNull()
  })
})

describe("messages and instructions", () => {
  const link = (t: string) => `[@${t}](#agent:${t})`
  it("renders each action as a room message", () => {
    expect(teamActionMessage({ kind: "ask", target: "x", text: "Q?", runs: true }, link)).toBe("[@x](#agent:x) ❓ Q?")
    expect(
      teamActionMessage({ kind: "delegate", target: "x", text: "Do", dueAt: "2026-11-01T23:59:59.000Z", runs: true }, link),
    ).toContain("Due: 2026-11-01")
  })
  it("quotes a teammate's words as data in the next instruction", () => {
    const ins = teamTurnInstruction("answer", "Teo", "Sudah beres.", { original: "Tiket Alvin?" })
    expect(ins).toContain("[Answer from Teo]\nSudah beres.")
    expect(ins).toContain("[Your question]\nTiket Alvin?")
  })
})
