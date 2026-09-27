import { describe, it, expect } from "vitest"
import type { Notification } from "@/types/notifications"
import type { PendingApproval } from "@/lib/agentApprovals"
import { summarizeAgentNotifications, summarizeElsewhere } from "@/lib/elsewhereNotifications"

const approval = (id: string, flag = false): Notification => ({
  id: `approval:${id}`,
  kind: "approval",
  agentType: "leads_qualifier",
  approval: {
    id,
    principal: "u1",
    tool_name: "odoo_create_lead",
    arguments: {},
    risk_tier: "medium",
    requested_at: "2026-09-27T00:00:00Z",
    status: "pending",
    resolved_at: null,
    resolved_by: null,
    verifier_finding: flag ? { verdict: "flag", reasoning: "odd", confidence: 0.5 } : null,
  } as PendingApproval,
})
const activity = (sessionId: string, title: string): Notification => ({
  id: `activity:${sessionId}`,
  kind: "activity",
  agentType: "leads_qualifier",
  sessionId,
  title,
  updatedAt: 1,
})
const expiring = (daysLeft: number): Notification => ({
  id: "conn:odoo",
  kind: "connection",
  agentType: "leads_qualifier",
  serverName: "Odoo",
  state: "expiring",
  daysLeft,
  detail: null,
})
const failedSchedule: Notification = {
  id: "schedule:s1",
  kind: "status",
  agentType: "leads_qualifier",
  title: "Daily leads",
  detail: null,
}

const names = (k: string) => ({ leads_qualifier: "Lex", autonomous: "Aira", customer_service: "Teo" })[k] ?? k

describe("summarizeElsewhere", () => {
  it("surfaces a non-approval badge that the old approvals-only section hid", () => {
    // The reported bug: Lex's avatar shows "1" for a new reply, the rail on
    // Aira showed nothing.
    const out = summarizeElsewhere({ leads_qualifier: [activity("s-lex", "Kampanye Alvin")] }, "autonomous", names)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      agentType: "leads_qualifier",
      count: 1,
      tone: "info",
      title: "New reply from Lex",
      sessionId: "s-lex",
    })
    expect(out[0].subtitle).toContain("Kampanye Alvin")
  })

  it("count always matches the agent-column badge (every kind)", () => {
    const items = [approval("a1"), expiring(3), failedSchedule, activity("s1", "x")]
    const [w] = summarizeElsewhere({ leads_qualifier: items }, "autonomous", names)
    expect(w.count).toBe(items.length)
    expect(w.subtitle).toContain("1 approval waiting")
    expect(w.subtitle).toContain("Odoo API key expires in 3 days")
    expect(w.subtitle).toContain("Daily leads")
    expect(w.subtitle).toContain("new reply in “x”")
    expect(w.title).toBe("Lex needs your approval")
    expect(w.tone).toBe("error") // a failed schedule outranks a plain approval
    expect(w.sessionId).toBeUndefined() // several things → open the agent, not one thread
  })

  it("never lists the open agent or the plain console", () => {
    const out = summarizeElsewhere(
      { autonomous: [approval("a1")], null: [activity("s0", "x")], customer_service: [approval("a2")] },
      "autonomous",
      names,
    )
    expect(out.map((w) => w.agentType)).toEqual(["customer_service"])
  })

  it("with no agent open (plain console), every agent is elsewhere", () => {
    const out = summarizeElsewhere({ autonomous: [approval("a1")] }, null, names)
    expect(out.map((w) => w.agentType)).toEqual(["autonomous"])
  })

  it("drops agents with nothing waiting", () => {
    expect(summarizeElsewhere({ leads_qualifier: [] }, "autonomous", names)).toEqual([])
  })
})

describe("summarizeAgentNotifications titles and tones", () => {
  it("flagged approval is an error", () => {
    const w = summarizeAgentNotifications("leads_qualifier", "Lex", [approval("a1", true)])!
    expect(w.tone).toBe("error")
    expect(w.subtitle).toContain("(one flagged)")
  })

  it("expiring key alone names the key in the title", () => {
    const w = summarizeAgentNotifications("leads_qualifier", "Lex", [expiring(0)])!
    expect(w.title).toBe("Lex: Odoo API key expires today")
    expect(w.tone).toBe("warn")
  })

  it("several unread threads open the agent, not a thread", () => {
    const w = summarizeAgentNotifications("leads_qualifier", "Lex", [activity("s1", "a"), activity("s2", "b")])!
    expect(w.title).toBe("New replies from Lex")
    expect(w.subtitle).toMatch(/^New replies in 2 threads\. Open Lex/)
    expect(w.sessionId).toBeUndefined()
  })
})
