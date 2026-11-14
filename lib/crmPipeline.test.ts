import { describe, expect, it } from "vitest"
import type { Company, Deal } from "./crmClient"
import { companyBody, customFieldText, daysUntil, dealBody, isPastClose, pipelineSummary, sharedCurrency, stageTotals, validFieldName } from "./crmPipeline"

const deal = (o: Partial<Deal> = {}): Deal => ({
  id: "d1",
  title: "Deal",
  value: null,
  currency: null,
  stage: "lead",
  company_id: null,
  contact_ids: [],
  expected_close_date: null,
  custom_fields: {},
  owner_agent: null,
  owner_user_id: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  ...o,
})

describe("stageTotals / pipelineSummary", () => {
  const deals = [
    deal({ stage: "lead", value: 1000 }),
    deal({ stage: "qualified", value: 2000 }),
    deal({ stage: "proposal", value: 3000 }),
    deal({ stage: "proposal", value: null }),
    deal({ stage: "won", value: 5000 }),
    deal({ stage: "lost", value: 9000 }),
  ]
  it("counts and sums per stage, treating a missing value as 0", () => {
    const t = stageTotals(deals)
    expect(t.proposal).toEqual({ count: 2, value: 3000 })
    expect(t.lost).toEqual({ count: 1, value: 9000 })
  })
  it("sums open stages, weights them, and keeps won apart", () => {
    expect(pipelineSummary(deals)).toEqual({ openValue: 6000, openCount: 4, weighted: 100 + 800 + 2100, wonValue: 5000, wonCount: 1 })
  })
})

describe("sharedCurrency", () => {
  it("returns the one currency every valued deal uses", () => {
    expect(sharedCurrency([deal({ value: 1, currency: "USD" }), deal({ value: 2, currency: "USD" }), deal({ value: null, currency: "IDR" })])).toBe("USD")
  })
  it("returns null for mixed or missing currencies", () => {
    expect(sharedCurrency([deal({ value: 1, currency: "USD" }), deal({ value: 2, currency: "IDR" })])).toBeNull()
    expect(sharedCurrency([deal({ value: 1 })])).toBeNull()
  })
})

describe("close dates", () => {
  const now = new Date(2026, 10, 14, 15, 0)
  it("counts calendar days", () => {
    expect(daysUntil("2026-11-14", now)).toBe(0)
    expect(daysUntil("2026-11-20", now)).toBe(6)
    expect(daysUntil("2026-11-10", now)).toBe(-4)
    expect(daysUntil("nope", now)).toBeNull()
  })
  it("flags only open deals past their date", () => {
    expect(isPastClose({ stage: "proposal", expected_close_date: "2026-11-10" }, now)).toBe(true)
    expect(isPastClose({ stage: "won", expected_close_date: "2026-11-10" }, now)).toBe(false)
    expect(isPastClose({ stage: "lead", expected_close_date: "2026-11-14" }, now)).toBe(false)
  })
})

describe("update bodies keep untouched fields", () => {
  it("deal: changing the title keeps stage, contacts and custom fields", () => {
    const d = deal({ stage: "proposal", contact_ids: ["c1"], custom_fields: { region: "EU" }, value: 5, currency: "USD" })
    expect(dealBody(d, { title: "  New  " })).toEqual({
      title: "New",
      value: 5,
      currency: "USD",
      stage: "proposal",
      company_id: null,
      contact_ids: ["c1"],
      expected_close_date: null,
      custom_fields: { region: "EU" },
    })
  })
  it("company: blank strings become null", () => {
    const c: Company = { id: "c", name: "Acme", domain: "acme.com", industry: null, size: null, custom_fields: {}, owner_agent: null, owner_user_id: null }
    expect(companyBody(c, { domain: "  " })).toEqual({ name: "Acme", domain: null, industry: null, size: null, custom_fields: {} })
  })
})

describe("custom fields", () => {
  it("renders JSON values as text", () => {
    expect(customFieldText("a")).toBe("a")
    expect(customFieldText(3)).toBe("3")
    expect(customFieldText(null)).toBe("")
    expect(customFieldText({ a: 1 })).toBe('{"a":1}')
  })
  it("rejects empty, long or duplicate names", () => {
    expect(validFieldName("  Region ", {})).toBe("Region")
    expect(validFieldName(" ", {})).toBeNull()
    expect(validFieldName("x".repeat(41), {})).toBeNull()
    expect(validFieldName("Region", { Region: 1 })).toBeNull()
  })
})
