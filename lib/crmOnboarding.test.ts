import { describe, expect, it } from "vitest"
import type { Activity, Company, Grant } from "./crmClient"
import {
  agentRecent,
  buildImportPlan,
  dateInDays,
  guessMapping,
  isSample,
  MAX_IMPORT_ROWS,
  parseCsv,
  SAMPLE_ACTIVITIES,
  SAMPLE_COMPANIES,
  SAMPLE_CONTACTS,
  SAMPLE_DEALS,
  setupChecklist,
  toDomain,
} from "./crmOnboarding"

const company = (o: Partial<Company> = {}): Company => ({ id: "c1", name: "Acme", domain: null, industry: null, size: null, custom_fields: {}, owner_agent: null, owner_user_id: "u", ...o })
const activity = (o: Partial<Activity> = {}): Activity => ({
  id: "a1",
  kind: "note",
  subject_type: "company",
  subject_id: "c1",
  body: "x",
  occurred_at: "2026-11-14T00:00:00Z",
  due_at: null,
  completed_at: null,
  created_at: "2026-11-14T00:00:00Z",
  owner_agent: null,
  owner_user_id: "u",
  ...o,
})
const grant = (o: Partial<Grant> = {}): Grant => ({ id: "g", label: "Lex", agent: "lex", scopes: [], created_at: "", expires_at: "2027-01-01T00:00:00Z", last_used_at: null, revoked_at: null, ...o })
const now = new Date("2026-11-14T12:00:00Z")

describe("sample dataset", () => {
  it("references only companies, contacts and deals that exist", () => {
    const ck = new Set(SAMPLE_COMPANIES.map((c) => c.key))
    const pk = new Set(SAMPLE_CONTACTS.map((c) => c.key))
    const dt = new Set(SAMPLE_DEALS.map((d) => d.title))
    for (const c of SAMPLE_CONTACTS) expect(ck.has(c.company)).toBe(true)
    for (const d of SAMPLE_DEALS) {
      expect(ck.has(d.company)).toBe(true)
      for (const p of d.contacts) expect(pk.has(p)).toBe(true)
    }
    for (const a of SAMPLE_ACTIVITIES) expect(dt.has(a.deal)).toBe(true)
  })
  it("marks records by custom field", () => {
    expect(isSample({ custom_fields: { Sample: "yes" } })).toBe(true)
    expect(isSample({ custom_fields: {} })).toBe(false)
    expect(isSample({ custom_fields: null })).toBe(false)
  })
  it("formats local dates", () => {
    expect(dateInDays(3, new Date(2026, 11, 30))).toBe("2027-01-02")
  })
})

describe("setupChecklist", () => {
  it("ignores sample data and expired grants", () => {
    const s = company({ id: "s1", custom_fields: { Sample: "yes" } })
    const items = setupChecklist(
      { companies: [s], contacts: [], deals: [], activities: [activity({ subject_id: "s1" })], grants: [grant({ expires_at: "2026-01-01T00:00:00Z" })] },
      now,
    )
    expect(items.every((i) => !i.done)).toBe(true)
  })
  it("ticks off real records, an active grant and a real activity", () => {
    const items = setupChecklist({ companies: [company()], contacts: [], deals: [], activities: [activity()], grants: [grant()] }, now)
    expect(items.filter((i) => i.done).map((i) => i.key)).toEqual(["company", "agent", "activity"])
  })
})

describe("agentRecent", () => {
  it("counts only agent-made items from the last 24 h", () => {
    const r = agentRecent(
      {
        companies: [{ ...company({ owner_agent: "lex", owner_user_id: null }), created_at: "2026-11-14T06:00:00Z" } as Company, { ...company({ owner_agent: "lex" }), created_at: "2026-11-10T00:00:00Z" } as Company],
        contacts: [],
        deals: [],
        activities: [activity({ owner_agent: "lex", created_at: "2026-11-14T11:00:00Z" }), activity({ created_at: "2026-11-14T11:00:00Z" })],
      },
      now,
    )
    expect(r).toEqual({ records: 1, activities: 1, agents: ["lex"] })
  })
})

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, embedded commas and newlines, CRLF and BOM", () => {
    expect(parseCsv('﻿Name,Note\r\n"Pratt, Dana","said ""hi""\nthen left"\r\n\r\nRafi,ok\n')).toEqual([
      ["Name", "Note"],
      ["Pratt, Dana", 'said "hi"\nthen left'],
      ["Rafi", "ok"],
    ])
  })
  it("detects semicolon and tab delimiters", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]])
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]])
  })
})

describe("guessMapping", () => {
  it("maps common headers, including Google Contacts exports", () => {
    expect(guessMapping(["First Name", "Last Name", "E-mail 1 - Value", "Organization 1 - Name", "Organization 1 - Title", "Website", "Notes"])).toEqual([
      "first_name",
      "last_name",
      "email",
      "company",
      "title",
      "domain",
      null,
    ])
  })
  it("uses each field once", () => {
    expect(guessMapping(["Email", "Email"])).toEqual(["email", null])
  })
})

describe("buildImportPlan", () => {
  const mapping = guessMapping(["Name", "Email", "Company", "Website"])
  it("dedupes companies, skips existing ones and links contacts by company name", () => {
    const plan = buildImportPlan(
      [
        ["Dana", "dana@x.test", "Northwind", "https://www.northwind.test/about"],
        ["Rafi", "", "northwind", ""],
        ["", "", "Acme", ""],
        ["", "", "", ""],
        ["", "only@mail.test", "", ""],
      ],
      mapping,
      ["ACME"],
    )
    expect(plan.companies).toEqual([{ name: "Northwind", domain: "northwind.test", industry: null }])
    expect(plan.contacts.map((c) => [c.name, c.company])).toEqual([
      ["Dana", "Northwind"],
      ["Rafi", "northwind"],
      ["only@mail.test", null],
    ])
    expect(plan.skipped).toBe(1)
  })
  it("joins first and last names and caps rows", () => {
    const m = guessMapping(["First name", "Last name"])
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 5 }, (_, i) => ["Ann", `Lee${i}`])
    const plan = buildImportPlan(rows, m)
    expect(plan.contacts[0].name).toBe("Ann Lee0")
    expect(plan.contacts).toHaveLength(MAX_IMPORT_ROWS)
    expect(plan.skipped).toBe(5)
  })
  it("normalises domains", () => {
    expect(toDomain("http://WWW.Acme.co.id/")).toBe("acme.co.id")
    expect(toDomain("not a domain")).toBeNull()
  })
})
