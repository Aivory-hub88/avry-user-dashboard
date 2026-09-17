import { describe, it, expect } from "vitest"
import {
  buildRoomPayload,
  candidateOf,
  getMentionCandidates,
  inferRoomFallback,
  isConsoleMention,
  loadRoomSticky,
  saveRoomSticky,
  parseAgentMentions,
  resolveNamedAgents,
  stripAgentMentions,
} from "@/lib/agentMentions"
import type { AgentDeployment } from "@/lib/agentChat"

const deployments: AgentDeployment[] = [
  { kind: "telegram", id: "b1", agentType: "customer_service", label: "Support" },
  { kind: "slack", id: "t1", agentType: "customer_service", label: "WS" },
  { kind: "telegram", id: "b2", agentType: "leads_qualifier", label: "Leads" },
]

const candidates = getMentionCandidates(deployments)

describe("getMentionCandidates", () => {
  it("returns deployed agents only, first-seen order", () => {
    expect(candidates.map((c) => c.type)).toEqual(["customer_service", "leads_qualifier"])
  })

  it("merges channel kinds per agent", () => {
    expect(candidates[0].channels).toEqual(["telegram", "slack"])
  })

  it("joins roster names", () => {
    expect(candidates[0].name).toBe("Teo")
    expect(candidates[1].name).toBe("Lex")
  })

  it("drops roster-less types", () => {
    const ds: AgentDeployment[] = [{ kind: "api", id: "k", agentType: "ghost", label: "x" }]
    expect(getMentionCandidates(ds)).toEqual([])
  })
})

describe("resolveNamedAgents", () => {
  it("resolves a bare first name, case-insensitive", () => {
    expect(resolveNamedAgents("bisa tolong panggilkan Lex?", candidates)).toEqual([
      "leads_qualifier",
    ])
    expect(resolveNamedAgents("tanya ke TEO soal tiket", candidates)).toEqual([
      "customer_service",
    ])
  })
  it("resolves agent type ids with and without underscores", () => {
    expect(resolveNamedAgents("route this to customer_service", candidates)).toEqual([
      "customer_service",
    ])
    expect(resolveNamedAgents("route this to leadsqualifier", candidates)).toEqual([
      "leads_qualifier",
    ])
  })
  it("keeps order of appearance and dedupes", () => {
    expect(resolveNamedAgents("Lex dulu, lalu Teo, lalu Lex lagi", candidates)).toEqual([
      "leads_qualifier",
      "customer_service",
    ])
  })
  it("ignores undeployed agents and substrings", () => {
    expect(resolveNamedAgents("panggilkan Geno", candidates)).toEqual([])
    expect(resolveNamedAgents("lexicon dan teori", candidates)).toEqual([])
    expect(resolveNamedAgents("halo semuanya", candidates)).toEqual([])
  })
})

describe("parseAgentMentions", () => {
  it("matches by first name, case-insensitive", () => {
    expect(parseAgentMentions("@teo check queue", candidates)).toEqual(["customer_service"])
    expect(parseAgentMentions("Hey @TEO!", candidates)).toEqual(["customer_service"])
  })

  it("matches by agent type id", () => {
    expect(parseAgentMentions("@customer_service hi", candidates)).toEqual(["customer_service"])
  })

  it("dedupes and keeps order of appearance", () => {
    expect(parseAgentMentions("@Lex then @teo then @lex", candidates)).toEqual([
      "leads_qualifier",
      "customer_service",
    ])
  })

  it("ignores undeployed roster agents and unknown tokens", () => {
    expect(parseAgentMentions("@Geno hi @someone", candidates)).toEqual([])
  })

  it("@all expands to every candidate", () => {
    expect(parseAgentMentions("@all status?", candidates)).toEqual([
      "customer_service",
      "leads_qualifier",
    ])
  })

  it("leaves emails alone", () => {
    expect(parseAgentMentions("mail me at a@b.com", candidates)).toEqual([])
  })
})

describe("stripAgentMentions", () => {
  it("removes resolved tokens only", () => {
    expect(stripAgentMentions("@teo check queue", candidates)).toBe("check queue")
    expect(stripAgentMentions("hi @someone", candidates)).toBe("hi @someone")
  })

  it("removes @all", () => {
    expect(stripAgentMentions("@all daily status", candidates)).toBe("daily status")
  })
})

describe("candidateOf", () => {  it("resolves roster entries", () => {
    expect(candidateOf("customer_service")).toMatchObject({ name: "Teo" })
  })

  it("returns null for unknown types", () => {
    expect(candidateOf("ghost")).toBeNull()
  })
})

describe("buildRoomPayload", () => {
  const teo = candidateOf("customer_service")!
  const lex = candidateOf("leads_qualifier")!

  const base = {
    me: teo,
    peers: [lex],
    userText: "Hi @Teo, can you help @Lex?",
    history: [] as { author: string; text: string }[],
    roundReplies: [] as { author: string; text: string }[],
  }

  it("names the recipient, peers, and keeps the raw message", () => {
    const p = buildRoomPayload(base)
    expect(p).toContain("You are Teo (Ticket Ops Agent)")
    expect(p).toContain("Lex (Leads Qualifier Agent)")
    expect(p).toContain("<user_message>\nHi @Teo, can you help @Lex?\n</user_message>")
  })

  it("carries author-tagged history and earlier round replies", () => {
    const p = buildRoomPayload({
      ...base,
      history: [{ author: "User", text: "morning" }],
      roundReplies: [{ author: "Lex", text: "I qualified 3 leads" }],
    })
    expect(p).toContain("<room_history>\nUser: morning\n</room_history>")
    expect(p).toContain("Lex: I qualified 3 leads")
  })

  it("omits empty sections", () => {
    const p = buildRoomPayload(base)
    expect(p).not.toContain("<room_history>")
    expect(p).not.toContain("<round_replies>")
  })

  it("handles solo rounds", () => {
    const p = buildRoomPayload({ ...base, peers: [] })
    expect(p).toContain("only agent answering")
  })

  it("clips long texts to bound tokens", () => {
    const p = buildRoomPayload({
      ...base,
      history: [{ author: "User", text: "x".repeat(5000) }],
    })
    expect(p.length).toBeLessThan(2000)
    expect(p).toContain("…")
  })
})

describe("inferRoomFallback", () => {
  it("returns the agent holding the floor after its questions", () => {
    expect(
      inferRoomFallback([
        { role: "user" },
        { role: "assistant", agentType: "leads_qualifier" },
      ]),
    ).toEqual(["leads_qualifier"])
  })

  it("returns the whole latest round in speaking order", () => {
    expect(
      inferRoomFallback([
        { role: "user" },
        { role: "assistant", agentType: "autonomous" },
        { role: "assistant", agentType: "customer_service" },
      ]),
    ).toEqual(["autonomous", "customer_service"])
  })

  it("stops at the previous round's user message", () => {
    expect(
      inferRoomFallback([
        { role: "user" },
        { role: "assistant", agentType: "autonomous" },
        { role: "user" },
        { role: "assistant", agentType: "leads_qualifier" },
      ]),
    ).toEqual(["leads_qualifier"])
  })

  it("ignores console replies and empty threads", () => {
    expect(inferRoomFallback([])).toEqual([])
    expect(
      inferRoomFallback([
        { role: "user" },
        { role: "assistant", agentType: null },
      ]),
    ).toEqual([])
  })

  it("stops at in-flight placeholders", () => {
    expect(
      inferRoomFallback([
        { role: "user" },
        { role: "assistant", agentType: "autonomous", isStreaming: true },
      ]),
    ).toEqual([])
  })
})

describe("isConsoleMention", () => {
  it("matches @aivory and @console as whole tokens", () => {
    expect(isConsoleMention("@aivory hi")).toBe(true)
    expect(isConsoleMention("ask @console this")).toBe(true)
    expect(isConsoleMention("@AIVORY")).toBe(true)
    expect(isConsoleMention("@teo hi")).toBe(false)
    expect(isConsoleMention("aivory hi")).toBe(false)
    expect(isConsoleMention("me@aivory.id")).toBe(false)
  })
})

describe("room sticky", () => {
  it("round-trips within freshness and degrades without storage", () => {
    // Node/vitest has no localStorage: helpers must no-op, never throw.
    expect(() => saveRoomSticky(["autonomous"])).not.toThrow()
    expect(loadRoomSticky()).toEqual([])
  })
})
