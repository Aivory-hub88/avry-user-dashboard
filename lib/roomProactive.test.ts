/** Proactive agent turns (ADR-019 P4): guardrails, budget, and the owner-scoped credential. */
import { describe, it, expect, vi, beforeEach } from "vitest"
import jwt from "jsonwebtoken"

const { queryMock, runMock, activityMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  runMock: vi.fn(async (..._args: unknown[]) => ({ status: 200 })),
  activityMock: vi.fn(async (..._args: unknown[]) => {}),
}))

vi.mock("@/lib/db", () => ({ query: queryMock }))
vi.mock("@/lib/spaceAgentRun", () => ({ runAgentTask: runMock }))
vi.mock("@/lib/workspaceActivity", () => ({ recordWorkspaceActivity: activityMock }))

import { onRoomOpened, onFileAdded, PROACTIVE_DAILY_BUDGET, PROACTIVE_CREATED_BY } from "@/lib/roomProactive"

process.env.JWT_SECRET = "test-secret"

let room: Record<string, unknown> | null
let agents: string[]
let used: number
let user: Record<string, unknown> | null
let sqls: { sql: string; params: unknown[] }[]

beforeEach(() => {
  vi.clearAllMocks()
  room = { id: "workspace:room-1", owner: "owner-1", workspace_id: "team-1", props: {}, deleted_at: null }
  agents = ["leads_qualifier"]
  used = 0
  user = { id: "owner-1", email: "rina@acme.co", username: "rina", full_name: "Rina", account_type: "free" }
  sqls = []
  queryMock.mockImplementation((sql: string, params: unknown[] = []) => {
    const s = sql.replace(/\s+/g, " ").trim()
    sqls.push({ sql: s, params })
    if (s.includes("FROM dashboard.workspace_docs")) return Promise.resolve({ rows: room ? [room] : [] })
    if (s.includes("FROM dashboard.workspace_agent_acl")) return Promise.resolve({ rows: agents.map((a) => ({ agent_type: a })) })
    if (s.includes("count(*)::int AS n FROM dashboard.workspace_agent_tasks")) return Promise.resolve({ rows: [{ n: used }] })
    if (s.includes("FROM identity.users")) return Promise.resolve({ rows: user ? [user] : [] })
    return Promise.resolve({ rows: [], rowCount: 1 })
  })
})

const inserted = (table: string) => sqls.filter((x) => x.sql.startsWith(`INSERT INTO dashboard.${table}`))

describe("proactive turns", () => {
  it("room.opened: posts a note, queues the lead agent, runs it as the owner with a short-lived access token", async () => {
    expect(await onRoomOpened("room-1")).toBe("started")
    const note = inserted("workspace_messages")[0]
    expect(note.sql).toContain("'system', 'aivory', 'Aivory'")
    const task = inserted("workspace_agent_tasks")[0]
    expect(task.params[3]).toBe("leads_qualifier")
    expect(task.params[6]).toBe(PROACTIVE_CREATED_BY)
    expect(task.params[2]).toBe(note.params[0]) // thread root + trigger = the note
    expect(String(task.params[4])).toContain("Don't change any data") // suggest guardrail

    const { credential } = runMock.mock.calls[0][0] as { credential: { token: string; user: { user_id: string } } }
    expect(credential.user.user_id).toBe("owner-1")
    const claims = jwt.verify(credential.token, "test-secret") as Record<string, unknown>
    expect(claims).toMatchObject({ user_id: "owner-1", type: "access", proactive: true })
    expect(Number(claims.exp) - Number(claims.iat)).toBe(120)
  })

  it("act mode drops the read-only guardrail", async () => {
    room!.props = { autonomy: "act" }
    await onFileAdded("room-1", "SOP.pdf", "rina")
    const task = inserted("workspace_agent_tasks")[0]
    expect(String(task.params[4])).toContain('"SOP.pdf"')
    expect(String(task.params[4])).not.toContain("Don't change any data")
  })

  it("observe mode: note only, no agent turn", async () => {
    room!.props = { autonomy: "observe" }
    expect(await onFileAdded("room-1", "SOP.pdf", "rina")).toBe("observe")
    expect(inserted("workspace_messages")).toHaveLength(1)
    expect(inserted("workspace_agent_tasks")).toHaveLength(0)
    expect(runMock).not.toHaveBeenCalled()
  })

  it("no agent in the room: note only", async () => {
    agents = []
    expect(await onRoomOpened("room-1")).toBe("no-agent")
    expect(inserted("workspace_agent_tasks")).toHaveLength(0)
  })

  it("over the daily budget: skipped and logged", async () => {
    used = PROACTIVE_DAILY_BUDGET
    expect(await onRoomOpened("room-1")).toBe("over-budget")
    expect(inserted("workspace_agent_tasks")).toHaveLength(0)
    expect(activityMock.mock.calls.some((c) => (c[0] as { action: string }).action === "agent.budget_exceeded")).toBe(true)
  })

  it("owner deleted or suspended: no credential, no turn", async () => {
    user = null
    expect(await onRoomOpened("room-1")).toBe("no-owner-credential")
    expect(runMock).not.toHaveBeenCalled()
  })

  it("unknown or trashed room: nothing at all", async () => {
    room = null
    expect(await onRoomOpened("room-1")).toBe("no-room")
    expect(inserted("workspace_messages")).toHaveLength(0)
  })
})
