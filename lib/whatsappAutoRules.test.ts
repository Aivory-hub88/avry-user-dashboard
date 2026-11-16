import { describe, expect, it } from "vitest"
import { holdReason, humanRecentlyReplied, needsHuman } from "./whatsappAutoRules"
import { isHumanSent, sentBody, whatsappParts } from "./crmWhatsapp"

const NOW = Date.parse("2026-11-16T12:00:00Z")
const note = (body: string, minAgo: number) => ({ kind: "note", body, occurred_at: new Date(NOW - minAgo * 60_000).toISOString() })

describe("stored markers", () => {
  it("round-trips template and auto-reply markers and keeps the message clean", () => {
    expect(whatsappParts(sentBody("Halo Irfan", { template: "hello", autoBy: "Lex" }))).toEqual({ text: "Halo Irfan", template: "hello", auto: "Lex" })
    expect(whatsappParts(sentBody("Halo"))).toEqual({ text: "Halo", template: null, auto: null })
    expect(whatsappParts("WhatsApp received: Hai\nbaris dua")).toEqual({ text: "Hai\nbaris dua", template: null, auto: null })
  })
  it("tells a teammate's message from an automatic one", () => {
    expect(isHumanSent({ kind: "note", body: sentBody("Hi") })).toBe(true)
    expect(isHumanSent({ kind: "note", body: sentBody("Hi", { autoBy: "Lex" }) })).toBe(false)
    expect(isHumanSent({ kind: "note", body: "WhatsApp received: Hi" })).toBe(false)
  })
})

describe("escalation", () => {
  it.each([
    "Saya mau bicara dengan manusia",
    "Can I talk to a real person?",
    "Ini komplain, saya kecewa",
    "I want a refund",
    "Saya akan lapor polisi",
    "tolong hubungi saya, mau bicara sama CS",
  ])("holds %s", (t) => expect(needsHuman(t)).toBe(true))
  it.each(["Halo, apa itu Aivory?", "Berapa harga paketnya?", "Terima kasih ya", "Jam berapa buka?"])("lets %s through", (t) => expect(needsHuman(t)).toBe(false))
})

describe("holdReason", () => {
  const base = { latest: "Halo", notes: [], contactCount: 0, accountCount: 0, now: NOW }
  it("allows a plain question", () => expect(holdReason(base)).toBeNull())
  it("holds when a teammate wrote in the last 15 minutes, not when only an automatic reply did or it was long ago", () => {
    expect(humanRecentlyReplied([note(sentBody("Hi"), 5)], NOW)).toBe(true)
    expect(humanRecentlyReplied([note(sentBody("Hi", { autoBy: "Lex" }), 5)], NOW)).toBe(false)
    expect(humanRecentlyReplied([note(sentBody("Hi"), 40)], NOW)).toBe(false)
    expect(holdReason({ ...base, notes: [note(sentBody("Hi"), 5)] })).toBe("human_active")
  })
  it("holds on limits, and escalation wins over the others", () => {
    expect(holdReason({ ...base, contactCount: 4 })).toBe("rate_limited")
    expect(holdReason({ ...base, accountCount: 60 })).toBe("rate_limited")
    expect(holdReason({ ...base, contactCount: 3, accountCount: 59 })).toBeNull()
    expect(holdReason({ ...base, latest: "mau refund", contactCount: 9 })).toBe("asked_for_human")
  })
})
