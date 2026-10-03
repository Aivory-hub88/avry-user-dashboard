/**
 * ADR-020 handoff in Team Space: an agent reply that @mentions an invited teammate
 * enqueues and runs a task for them, in the same thread, bounded by depth/turns.
 * Stateful fake DB; the backend agent call is mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

type Row = Record<string, unknown>
const { db, queryMock } = vi.hoisted(() => {
  const db = { tasks: [] as Row[], messages: [] as Row[], acl: [] as string[], seq: 0 }
  return { db, queryMock: vi.fn() }
})
vi.mock("@/lib/db", () => ({ query: queryMock, withTransaction: async (fn: (tx: unknown) => unknown) => fn(async () => ({ rows: [] })) }))
vi.mock("@/lib/workspaceActivity", () => ({ recordWorkspaceActivity: async () => undefined }))
vi.mock("@/lib/roomContext", () => ({ ingestRoomFiles: async () => undefined, loadRoomContext: async () => null }))

import { runAgentTask } from "./spaceAgentRun"

const NOW = "2026-10-03T10:00:00.000Z"
const credential = { kind: "user" as const, token: "jwt", user: { user_id: "u1", email: "a@x.id", account_type: "member" } }

function taskRow(over: Row): Row {
  return {
    id: `t${++db.seq}`, space_id: "s1", thread_root: "root1", trigger_msg: "human1", agent_type: "leads_qualifier",
    instruction: "siapkan laporan", status: "todo", reason: "", result_msg: null, approval_ref: {},
    created_by: "user:u1", created_at: NOW, updated_at: NOW, chain_root: null, chain_depth: 0, ...over,
  }
}

queryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
  const q = sql.replace(/\s+/g, " ")
  if (q.includes("FROM dashboard.workspace_agent_tasks WHERE id = $1")) return { rows: db.tasks.filter((t) => t.id === params[0]) }
  if (q.startsWith("UPDATE dashboard.workspace_agent_tasks")) {
    const t = db.tasks.find((x) => x.id === params[0]); if (t) { t.status = params[1] as string }
    return { rows: [], rowCount: 1 }
  }
  if (q.includes("FROM dashboard.workspace_agent_acl")) return { rows: db.acl.map((a) => ({ agent_type: a })) }
  if (q.includes("FROM dashboard.workspace_docs")) return { rows: [{ id: "s1", owner: "u1" }] }
  if (q.includes("count(*)::int AS n")) {
    const root = params[1]; const by: Record<string, number> = {}
    for (const t of db.tasks) if (t.chain_root === root || (t.chain_root == null && t.trigger_msg === root)) by[String(t.agent_type)] = (by[String(t.agent_type)] ?? 0) + 1
    return { rows: Object.entries(by).map(([agent_type, n]) => ({ agent_type, n })) }
  }
  if (q.includes("SELECT agent_type FROM dashboard.workspace_agent_tasks") && q.includes("status IN"))
    return { rows: db.tasks.filter((t) => ["todo", "in_progress", "blocked"].includes(String(t.status))).map((t) => ({ agent_type: t.agent_type })) }
  if (q.startsWith("INSERT INTO dashboard.workspace_agent_tasks")) {
    const hasChain = q.includes("chain_root")
    const t = taskRow({ id: `t${++db.seq}`, agent_type: params[4], instruction: params[5], trigger_msg: params[3], created_by: params[7], chain_root: hasChain ? params[8] : null, chain_depth: hasChain ? params[9] : 0 })
    db.tasks.push(t); return { rows: [t] }
  }
  if (q.startsWith("INSERT INTO dashboard.workspace_messages")) {
    const m = { id: params[0], space_id: params[1], thread_root: params[2], author_kind: "agent", author_id: params[3], author_name: params[4], agent_type: params[3], body: params[5], mentions: params[6], member_ids: [], here: false, has_agent: params[9], doc_refs: [], created_at: NOW, edited_at: null, deleted_at: null }
    db.messages.push(m); return { rows: [m] }
  }
  return { rows: [], rowCount: 0 }
})

/** What each agent replies, in order of its turns. */
function backend(replies: Record<string, string[]>) {
  const turns: string[] = []
  const used: Record<string, number> = {}
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: { body?: unknown }) => {
    const body = JSON.parse(String(init.body)) as { agent_type: string }
    turns.push(body.agent_type)
    const list = replies[body.agent_type] ?? ["ok"]
    const i = used[body.agent_type] ?? 0; used[body.agent_type] = i + 1
    return { ok: true, json: async () => ({ reply: list[Math.min(i, list.length - 1)], pending_approval: null }) }
  }))
  return turns
}
const settle = () => new Promise((r) => setTimeout(r, 30))

beforeEach(() => {
  db.tasks = []; db.messages = []; db.acl = ["leads_qualifier", "customer_service", "autonomous"]; db.seq = 0
  queryMock.mockClear()
})

describe("Team Space handoff", () => {
  it("runs a mentioned teammate in the same thread, and links the mention", async () => {
    const turns = backend({ leads_qualifier: ["Data siap. @Teo tolong cek tiket Alvin."], customer_service: ["Tiket Alvin selesai."] })
    const first = taskRow({})
    db.tasks.push(first)
    await runAgentTask({ spaceId: "s1", taskId: String(first.id), credential })
    await settle()

    expect(turns).toEqual(["leads_qualifier", "customer_service"])
    const [lexMsg, teoMsg] = db.messages
    expect(lexMsg.body).toBe("Data siap. [@Teo](#agent:customer_service) tolong cek tiket Alvin.")
    expect(lexMsg.mentions).toEqual(["customer_service"])
    expect(teoMsg.agent_type).toBe("customer_service")
    expect(teoMsg.thread_root).toBe("root1")

    const handed = db.tasks.find((t) => t.agent_type === "customer_service")!
    expect(handed).toMatchObject({ created_by: "agent:leads_qualifier", chain_root: "human1", chain_depth: 1 })
    expect(String(handed.instruction)).toContain("Handoff dari Lex")
  })

  it("never hands off to an agent that is not invited, to itself, or on @all", async () => {
    db.acl = ["leads_qualifier", "customer_service"]
    const turns = backend({ leads_qualifier: ["@Geno @Lex @all tolong"] })
    const first = taskRow({}); db.tasks.push(first)
    await runAgentTask({ spaceId: "s1", taskId: String(first.id), credential })
    await settle()
    expect(turns).toEqual(["leads_qualifier"])
    expect(db.tasks).toHaveLength(1)
  })

  it("stops at the depth limit", async () => {
    const turns = backend({ leads_qualifier: ["@Teo bantu"], customer_service: ["@Geno lanjut"], autonomous: ["@Lex lagi"] })
    const first = taskRow({}); db.tasks.push(first)
    await runAgentTask({ spaceId: "s1", taskId: String(first.id), credential })
    await settle(); await settle(); await settle()
    // Lex (0) -> Teo (1) -> Geno (2); Geno's @Lex would be depth 3, so it stops.
    expect(turns).toEqual(["leads_qualifier", "customer_service", "autonomous"])
    expect(db.tasks.map((t) => t.chain_depth)).toEqual([0, 1, 2])
  })

  it("does not queue an agent that already has an open task in the thread", async () => {
    const turns = backend({ leads_qualifier: ["@Teo ikut ya"] })
    const first = taskRow({}); db.tasks.push(first)
    db.tasks.push(taskRow({ agent_type: "customer_service", status: "in_progress" })) // the human also asked Teo
    await runAgentTask({ spaceId: "s1", taskId: String(first.id), credential })
    await settle()
    expect(turns).toEqual(["leads_qualifier"])
    expect(db.tasks).toHaveLength(2)
  })

  it("a single-agent space never hands off", async () => {
    db.acl = ["leads_qualifier"]
    const turns = backend({ leads_qualifier: ["@Teo ada?"] })
    const first = taskRow({}); db.tasks.push(first)
    await runAgentTask({ spaceId: "s1", taskId: String(first.id), credential })
    await settle()
    expect(turns).toEqual(["leads_qualifier"])
  })

  it("keeps the reply that was already posted when the handoff step fails (e.g. migration not applied)", async () => {
    backend({ leads_qualifier: ["@Teo tolong"] })
    const real = queryMock.getMockImplementation()!
    queryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("chain_root")) throw new Error('column "chain_root" does not exist')
      return real(sql, params)
    })
    const first = taskRow({}); db.tasks.push(first)
    const res = await runAgentTask({ spaceId: "s1", taskId: String(first.id), credential })
    expect(res.status).toBe(200)
    expect(db.messages).toHaveLength(1)
    queryMock.mockImplementation(real)
  })
})
