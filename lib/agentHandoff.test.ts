import { describe, it, expect } from "vitest"
import {
  extractAgentMentions,
  planHandoffs,
  linkAgentMentions,
  HANDOFF_MAX_DEPTH,
  HANDOFF_MAX_TURNS,
  HANDOFF_MAX_PER_AGENT,
} from "./agentHandoff"

const team = [
  { type: "autonomous", name: "Geno" },
  { type: "customer_service", name: "Teo" },
  { type: "leads_qualifier", name: "Lex" },
  { type: "chief_of_staff", name: "Aira" },
]

describe("extractAgentMentions", () => {
  it("finds deliberate @Name calls in order, once each", () => {
    expect(extractAgentMentions("@Teo tolong cek tiket, lalu @Lex follow up. @teo ya?", team)).toEqual([
      "customer_service",
      "leads_qualifier",
    ])
  })

  it("matches type ids with or without underscores", () => {
    expect(extractAgentMentions("@customer_service dan @leadsqualifier", team)).toEqual([
      "customer_service",
      "leads_qualifier",
    ])
  })

  it("ignores a bare name, emails, unknown names and the agent itself", () => {
    expect(extractAgentMentions("Teo sudah jawab, hubungi lex@aivory.id atau @Budi", team)).toEqual([])
    expect(extractAgentMentions("Saya @Teo sendiri", team, "customer_service")).toEqual([])
  })

  it("never fans out from @all / @everyone / @here", () => {
    expect(extractAgentMentions("@all @everyone @here @semua", team)).toEqual([])
    expect(extractAgentMentions("@all tolong @Lex saja", team)).toEqual(["leads_qualifier"])
  })

  it("does not treat code as a call", () => {
    expect(extractAgentMentions("contoh: `@Lex`\n```\n@Teo\n```", team)).toEqual([])
  })
})

describe("planHandoffs", () => {
  const base = { depth: 0, usedPerAgent: { leads_qualifier: 1 }, usedTotal: 1 }

  it("hands off to a mentioned teammate", () => {
    expect(planHandoffs("@Teo cek tiketnya", team, "leads_qualifier", base)).toEqual(["customer_service"])
  })

  it("stops at the depth limit", () => {
    expect(planHandoffs("@Teo", team, "leads_qualifier", { ...base, depth: HANDOFF_MAX_DEPTH })).toEqual([])
    expect(planHandoffs("@Teo", team, "leads_qualifier", { ...base, depth: HANDOFF_MAX_DEPTH - 1 })).toEqual([
      "customer_service",
    ])
  })

  it("stops at the total-turn limit and trims a long list to fit", () => {
    expect(planHandoffs("@Teo", team, "leads_qualifier", { ...base, usedTotal: HANDOFF_MAX_TURNS })).toEqual([])
    expect(
      planHandoffs("@Teo @Geno @Aira", team, "leads_qualifier", { ...base, usedTotal: HANDOFF_MAX_TURNS - 2 }),
    ).toEqual(["customer_service", "autonomous"])
  })

  it("stops ping-pong: an agent that spoke its quota is not called again", () => {
    const used = { leads_qualifier: 1, customer_service: HANDOFF_MAX_PER_AGENT }
    expect(planHandoffs("@Teo", team, "leads_qualifier", { ...base, usedPerAgent: used })).toEqual([])
  })

  it("does not queue someone who already has a turn waiting", () => {
    expect(planHandoffs("@Teo @Geno", team, "leads_qualifier", { ...base, queued: ["customer_service"] })).toEqual([
      "autonomous",
    ])
  })

  it("never hands off to itself or outside the room", () => {
    expect(planHandoffs("@Lex @Budi", team, "leads_qualifier", base)).toEqual([])
  })
})

describe("linkAgentMentions", () => {
  it("turns plain @Name into the workspace link token", () => {
    expect(linkAgentMentions("Halo @Teo, tolong bantu", team)).toBe("Halo [@Teo](#agent:customer_service), tolong bantu")
  })

  it("leaves link tokens, code, unknown names and broadcast alone", () => {
    const same = "[@Teo](#agent:customer_service) `@Lex` @Budi @all x@y.id"
    expect(linkAgentMentions(same, team)).toBe(same)
  })

  it("handles several mentions and keeps the label as written", () => {
    expect(linkAgentMentions("@geno lalu @LEX", team)).toBe("[@geno](#agent:autonomous) lalu [@LEX](#agent:leads_qualifier)")
  })
})
