import { describe, it, expect } from "vitest"
import { buildRoomPayload, candidateOf } from "@/lib/agentMentions"
import { buildLedgerHint, latestByAgent } from "@/lib/roomLedger"
import type { LedgerTask } from "@/lib/airaTasks"

function task(over: Partial<LedgerTask>): LedgerTask {
  return {
    task_id: "t1",
    tenant_id: "u1",
    agent_type: "leads_qualifier",
    session_id: "s1",
    title: "Qualify Acme",
    status: "todo",
    priority: "normal",
    blocked_reason: null,
    created_at: "2026-09-18T00:00:00Z",
    updated_at: "2026-09-18T01:00:00Z",
    ...over,
  }
}

describe("latestByAgent", () => {
  it("keeps the most recently updated row per agent", () => {
    const rows = [
      task({ task_id: "a", status: "todo", updated_at: "2026-09-18T01:00:00Z" }),
      task({ task_id: "b", status: "done", updated_at: "2026-09-18T02:00:00Z" }),
    ]
    expect(latestByAgent(rows).get("leads_qualifier")?.task_id).toBe("b")
  })
})

describe("buildLedgerHint", () => {
  it("done tasks order a text summary with zero tool calls", () => {
    const hint = buildLedgerHint(
      [task({ status: "done", title: "Qualify Acme" })],
      ["leads_qualifier"],
    )
    expect(hint).toContain("is done")
    expect(hint).toContain("ZERO tool calls")
  })

  it("open tasks order continuation without duplicates", () => {
    const hint = buildLedgerHint([task({ status: "in_progress" })], ["leads_qualifier"])
    expect(hint).toContain("is in_progress")
    expect(hint).toContain("do not create a duplicate task")
  })

  it("blocked tasks carry the reason", () => {
    const hint = buildLedgerHint(
      [task({ status: "blocked", blocked_reason: "waiting on owner" })],
      ["leads_qualifier"],
    )
    expect(hint).toContain("is blocked")
    expect(hint).toContain("waiting on owner")
  })

  it("agents without rows get no line, empty targets give null", () => {
    expect(buildLedgerHint([task({})], ["customer_service"])).toBeNull()
    expect(buildLedgerHint([task({})], [])).toBeNull()
  })
})

describe("buildRoomPayload ledger block", () => {
  const me = candidateOf("leads_qualifier") ?? {
    type: "leads_qualifier",
    name: "Lex",
    title: "Sales",
    channels: [],
  }
  const base = {
    me,
    peers: [],
    userText: "lanjut",
    history: [],
    roundReplies: [],
  }

  it("omits the block when hint is null", () => {
    expect(buildRoomPayload({ ...base, ledgerHint: null })).not.toContain("<ledger>")
  })

  it("renders the hint between round_replies and user_message", () => {
    const out = buildRoomPayload({ ...base, ledgerHint: "Your task is done." })
    expect(out).toContain("<ledger>\nYour task is done.\n</ledger>")
    expect(out.indexOf("<ledger>")).toBeLessThan(out.indexOf("<user_message>"))
  })
})
