/**
 * ADR-021 agent-to-agent communication in Team Space: team_actions relayed from Cerveau are
 * carried out by the room (posted messages, teammate turns, answers routed back, reminders).
 * Stateful fake DB; the backend agent call is mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

type Row = Record<string, unknown>
const { db, queryMock } = vi.hoisted(() => {
  const db = { tasks: [] as Row[], messages: [] as Row[], reminders: [] as Row[], acl: [] as string[], seq: 0 }
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
  if (q.startsWith("INSERT INTO dashboard.workspace_agent_tasks") && q.includes("from_agent")) {
    const t = taskRow({ id: `t${++db.seq}`, agent_type: params[4], instruction: params[5], trigger_msg: params[3], created_by: params[7], chain_root: params[8], chain_depth: params[9], kind: params[10], from_agent: params[11], reply_to: params[12], due_at: params[13] })
    db.tasks.push(t); return { rows: [t] }
  }
  if (q.startsWith("INSERT INTO dashboard.workspace_agent_reminders")) {
    db.reminders.push({ id: params[0], target_agent: params[3], from_agent: params[4], text: params[5], fire_at: params[6] }); return { rows: [] }
  }
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

type Turn = { reply: string; team_actions?: unknown[] }
/** What each agent answers (reply + team actions), in order of its turns. Records every prompt. */
function backend(turnsBy: Record<string, Turn[]>) {
  const turns: { agent: string; text: string }[] = []
  const used: Record<string, number> = {}
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: { body?: unknown }) => {
    const body = JSON.parse(String(init.body)) as { agent_type: string; text: string }
    turns.push({ agent: body.agent_type, text: body.text })
    const list = turnsBy[body.agent_type] ?? [{ reply: "ok" }]
    const i = used[body.agent_type] ?? 0; used[body.agent_type] = i + 1
    const t = list[Math.min(i, list.length - 1)]
    return { ok: true, json: async () => ({ reply: t.reply, pending_approval: null, team_actions: t.team_actions ?? [] }) }
  }))
  return turns
}
const settle = () => new Promise((r) => setTimeout(r, 30))

beforeEach(() => {
  db.tasks = []; db.messages = []; db.reminders = []; db.acl = ["leads_qualifier", "customer_service", "autonomous"]; db.seq = 0
  queryMock.mockClear()
})

describe("Team Space agent-to-agent communication", () => {
  it("routes a teammate's answer back to the agent that asked, which then continues", async () => {
    const turns = backend({
      leads_qualifier: [
        { reply: "Saya cek dulu ke Teo.", team_actions: [{ kind: "ask", to: "Teo", text: "Tiket Alvin sudah beres?" }] },
        { reply: "Tiket beres, lead Alvin siap ditindaklanjuti." },
      ],
      customer_service: [{ reply: "Sudah, tiket Alvin ditutup kemarin." }],
    })
    db.tasks.push(taskRow({ id: "t0" }))
    await runAgentTask({ spaceId: "s1", taskId: "t0", credential })
    await settle(); await settle()

    expect(turns.map((t) => t.agent)).toEqual(["leads_qualifier", "customer_service", "leads_qualifier"])
    expect(turns[1].text).toContain("[Question from Lex]")
    expect(turns[2].text).toContain("[Answer from Teo]")
    expect(turns[2].text).toContain("Sudah, tiket Alvin ditutup kemarin.")
    expect(turns[2].text).toContain("Tiket Alvin sudah beres?")

    const ask = db.messages.find((m) => String(m.body).includes("❓"))
    expect(ask?.agent_type).toBe("leads_qualifier")
    expect(String(ask?.body)).toContain("(#agent:customer_service)")
    expect(db.tasks.map((t) => t.kind ?? "mention")).toEqual(["mention", "ask", "answer"])
    expect(db.messages.at(-1)?.body).toBe("Tiket beres, lead Alvin siap ditindaklanjuti.")
  })

  it("delegates with a due date and reports back to the delegator", async () => {
    const turns = backend({
      leads_qualifier: [
        { reply: "Fina, tolong invoice.", team_actions: [{ kind: "delegate", to: "Teo", text: "Kirim follow-up ke Alvin", due: "2026-11-01" }] },
        { reply: "Terima kasih Teo, saya lanjutkan." },
      ],
      customer_service: [{ reply: "Follow-up terkirim." }],
    })
    db.tasks.push(taskRow({ id: "t0" }))
    await runAgentTask({ spaceId: "s1", taskId: "t0", credential })
    await settle(); await settle()
    expect(turns.map((t) => t.agent)).toEqual(["leads_qualifier", "customer_service", "leads_qualifier"])
    const delegated = db.tasks.find((t) => t.kind === "delegate")
    expect(delegated?.due_at).toBe("2026-11-01T23:59:59.000Z")
    expect(turns[2].text).toContain("[Report from Teo]")
  })

  it("posts an FYI without starting a turn, and schedules reminders", async () => {
    const turns = backend({
      leads_qualifier: [{
        reply: "Catat ya.",
        team_actions: [
          { kind: "message", to: "Teo", text: "Alvin minta dihubungi sore." },
          { kind: "remind", to: "self", text: "cek pembayaran Alvin", when: "in 2h" },
        ],
      }],
    })
    db.tasks.push(taskRow({ id: "t0" }))
    await runAgentTask({ spaceId: "s1", taskId: "t0", credential })
    await settle()
    expect(turns.map((t) => t.agent)).toEqual(["leads_qualifier"])
    expect(db.messages.some((m) => String(m.body).includes("Alvin minta dihubungi sore."))).toBe(true)
    expect(db.reminders).toHaveLength(1)
    expect(db.reminders[0].target_agent).toBe("leads_qualifier")
  })

  it("says what it could not send and does not fall back to @mention parsing", async () => {
    const turns = backend({
      leads_qualifier: [{ reply: "Saya tanya @Teo juga.", team_actions: [{ kind: "ask", to: "Ghost", text: "?" }] }],
    })
    db.tasks.push(taskRow({ id: "t0" }))
    await runAgentTask({ spaceId: "s1", taskId: "t0", credential })
    await settle()
    expect(turns.map((t) => t.agent)).toEqual(["leads_qualifier"])
    expect(String(db.messages[0].body)).toContain("Not sent")
    expect(String(db.messages[0].body)).toContain("Ghost is not in this room")
  })
})
