/**
 * ADR-021 §4 (follow-up #5), the pure half: waits, missed-reminder policy, unattended turns.
 */
import { describe, it, expect } from "vitest"
import {
  REMINDER_LATE_MS,
  openWaitsNote,
  parseTeamActions,
  planTeamActions,
  reminderFireOutcome,
  requestTextOf,
  teamActionMessage,
  teamTurnInstruction,
  unattendedTurnOrigin,
  waitWakeInstruction,
} from "./teamComms"

const team = [
  { type: "leads_qualifier", name: "Lex" },
  { type: "customer_service", name: "Teo" },
]
const base = { depth: 0, usedPerAgent: { leads_qualifier: 1 }, usedTotal: 1 }
const NOW = Date.parse("2026-10-24T10:00:00Z")
const wait = { id: "w_1", requestText: "Kirim penawaran ke Toko Melati", note: "tunggu harga dari Teo", createdAt: "2026-10-24T09:00:00.000Z" }

describe("parseTeamActions (follow-up #5)", () => {
  it("keeps wait, wait_close (without text) and a remind's missed policy", () => {
    expect(
      parseTeamActions([
        { kind: "wait", to: "self", text: "tunggu harga", when: "in 2h" },
        { kind: "wait_close", to: "self", text: "", wait_id: "w_abc" },
        { kind: "wait_close", to: "self", text: "", wait_id: "drop table" },
        { kind: "remind", to: "self", text: "cek", when: "in 1d", missed_policy: "skip" },
        { kind: "remind", to: "self", text: "cek", when: "in 1d", missed_policy: "later" },
        { kind: "wait", to: "self", text: "" },
      ]),
    ).toEqual([
      { kind: "wait", to: "self", text: "tunggu harga", when: "in 2h" },
      { kind: "wait_close", to: "self", text: "", wait_id: "w_abc" },
      { kind: "wait_close", to: "self", text: "" },
      { kind: "remind", to: "self", text: "cek", when: "in 1d", missed_policy: "skip" },
      { kind: "remind", to: "self", text: "cek", when: "in 1d" },
    ])
  })
})

describe("planTeamActions (follow-up #5)", () => {
  it("plans waits for the agent itself, with an optional wake time", () => {
    const { planned, dropped } = planTeamActions(
      [
        { kind: "wait", to: "self", text: "tunggu harga", when: "in 2h" },
        { kind: "wait", to: "self", text: "tunggu deploy" },
        { kind: "wait", to: "self", text: "x", when: "in 40d" },
      ],
      team,
      "leads_qualifier",
      base,
      NOW,
    )
    expect(planned).toEqual([
      { kind: "wait", target: "leads_qualifier", text: "tunggu harga", wakeAt: "2026-10-24T12:00:00.000Z" },
      { kind: "wait", target: "leads_qualifier", text: "tunggu deploy", wakeAt: null },
    ])
    expect(dropped[0].reason).toContain("30 days")
  })

  it("plans closing a wait and keeps a remind's missed policy", () => {
    const { planned } = planTeamActions(
      [
        { kind: "wait_close", to: "self", text: "", wait_id: "w_1" },
        { kind: "remind", to: "Teo", text: "follow up", when: "in 1d", missed_policy: "skip" },
      ],
      team,
      "leads_qualifier",
      base,
      NOW,
    )
    expect(planned).toEqual([
      { kind: "wait_close", target: "leads_qualifier", text: "", waitId: "w_1" },
      { kind: "remind", target: "customer_service", text: "follow up", fireAt: "2026-10-25T10:00:00.000Z", missedPolicy: "skip" },
    ])
  })

  it("posts waits as visible messages", () => {
    const link = (t: string) => `@${t}`
    expect(teamActionMessage({ kind: "wait", target: "x", text: "tunggu harga", wakeAt: "2026-10-24T12:00:00.000Z" }, link)).toBe(
      "⏳ Waiting: tunggu harga\n\nI check again at 2026-10-24 12:00 UTC.",
    )
    expect(teamActionMessage({ kind: "wait_close", target: "x", text: "", waitId: null }, link)).toBe("✅ No longer waiting.")
  })
})

describe("missed reminders", () => {
  it("fires on time within the grace window, then late or skipped by policy", () => {
    const at = NOW
    expect(reminderFireOutcome(at, at + REMINDER_LATE_MS)).toBe("on_time")
    expect(reminderFireOutcome(at, at + REMINDER_LATE_MS + 1)).toBe("late")
    expect(reminderFireOutcome(at, at + REMINDER_LATE_MS + 1, "skip")).toBe("skipped")
  })

  it("a late reminder says so, and every reminder may end quietly", () => {
    const late = teamTurnInstruction("reminder", "Geno", "cek pembayaran", { lateSince: "2026-10-24T08:00:00.000Z" })
    expect(late).toContain("was due at 2026-10-24 08:00 UTC and fires late")
    expect(late).toContain("run_no_update")
    expect(late).toContain("[Reminder]\ncek pembayaran")
    expect(teamTurnInstruction("reminder", "", "cek")).not.toContain("fires late")
  })
})

describe("waits", () => {
  it("a woken turn repeats the original request and note, with the wait id", () => {
    const text = waitWakeInstruction([wait], "webhook", "build 412 passed")
    expect(text).toContain("an outside event woke it (build 412 passed)")
    expect(text).toContain("[Wait w_1 since 2026-10-24 09:00 UTC]")
    expect(text).toContain("[Original request]\nKirim penawaran ke Toko Melati\n[Your note]\ntunggu harga dari Teo")
    expect(text).toContain("team_wait_close")
  })

  it("answer turns list the open waits", () => {
    expect(openWaitsNote([])).toBe("")
    expect(openWaitsNote([wait])).toContain("[Original request]\nKirim penawaran ke Toko Melati")
  })

  it("keeps the request a turn was working on, not the wrapper around it", () => {
    expect(requestTextOf("Teo asks you. Answer them.\n[Question from Teo]\nHarga paket A?")).toBe("Harga paket A?")
    expect(requestTextOf("buat laporan mingguan")).toBe("buat laporan mingguan")
    // Waiting again from a woken turn keeps the first request, not the wake prompt.
    expect(requestTextOf(waitWakeInstruction([wait], "reminder"))).toBe("Kirim penawaran ke Toko Melati")
  })
})

describe("unattended turns", () => {
  it("only reminder and wake turns are sent as unattended", () => {
    expect(unattendedTurnOrigin("reminder")).toBe("reminder")
    expect(unattendedTurnOrigin("wake")).toBe("wake")
    for (const kind of ["mention", "ask", "answer", "delegate", undefined]) expect(unattendedTurnOrigin(kind)).toBeNull()
  })
})
