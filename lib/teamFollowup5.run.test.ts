/**
 * ADR-021 §4 (follow-up #5) end to end in the room: reminders fired for one member (the backend
 * sweeper's call) with the missed policy, waits that are kept and woken, and quiet / failed
 * unattended runs. Stateful fake DB; the backend agent call is mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

type Row = Record<string, unknown>
const { db, queryMock } = vi.hoisted(() => {
  const db = {
    tasks: [] as Row[], messages: [] as Row[], reminders: [] as Row[], waits: [] as Row[],
    acl: [] as string[], seq: 0, now: 0,
  }
  return { db, queryMock: vi.fn() }
})
vi.mock("@/lib/db", () => ({ query: queryMock }))
vi.mock("@/lib/workspaceActivity", () => ({ recordWorkspaceActivity: async () => undefined }))
vi.mock("@/lib/roomContext", () => ({ ingestRoomFiles: async () => undefined, loadRoomContext: async () => null }))

import { runAgentTask } from "./spaceAgentRun"
import { fireDueReminders } from "./teamReminders"
import { requestWake } from "./teamWaits"

const NOW = "2026-10-26T10:00:00.000Z"
const credential = { kind: "user" as const, token: "minted", user: { user_id: "u1", email: "a@x.id", account_type: "member" } }

function taskRow(over: Row): Row {
  return {
    id: `t${++db.seq}`, space_id: "s1", thread_root: "root1", trigger_msg: "human1", agent_type: "autonomous",
    instruction: "pantau lead baru", status: "todo", reason: "", result_msg: null, approval_ref: {},
    created_by: "user:u1", created_at: NOW, updated_at: NOW, chain_root: null, chain_depth: 0, kind: "mention", ...over,
  }
}

queryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
  const q = sql.replace(/\s+/g, " ")
  const task = (id: unknown) => db.tasks.find((x) => x.id === id)
  // ── reminders ──
  if (q.startsWith("UPDATE dashboard.workspace_agent_reminders SET fired_at = now(), fire_outcome = CASE")) {
    const due = db.reminders.filter((r) => !r.fired_at && Date.parse(String(r.fire_at)) <= db.now && (params[1] === null || r.credential_owner === params[1]))
    for (const r of due) {
      r.fired_at = NOW
      const lateMs = db.now - Date.parse(String(r.fire_at))
      r.fire_outcome = lateMs <= 600_000 ? "on_time" : r.missed_policy === "skip" ? "skipped" : "late"
    }
    return { rows: due.map((r) => ({ ...r })) }
  }
  if (q.includes("SET fired_at = now(), fire_outcome = 'skipped' WHERE wait_id = ANY($1)")) {
    for (const r of db.reminders) if ((params[0] as string[]).includes(String(r.wait_id)) && !r.fired_at) { r.fired_at = NOW; r.fire_outcome = "skipped" }
    return { rows: [] }
  }
  if (q.startsWith("INSERT INTO dashboard.workspace_agent_reminders") && q.includes("SELECT $1, w.space_id")) {
    const w = db.waits.find((x) => x.id === params[2] && x.status === "open")
    if (!w) return { rows: [] }
    db.reminders.push({ id: params[0], space_id: "s1", thread_root: w.thread_root, target_agent: w.agent_type, from_agent: "webhook", text: params[3], fire_at: new Date(db.now).toISOString(), credential_owner: w.credential_owner, wait_id: w.id, missed_policy: "run_once" })
    return { rows: [{ id: params[0] }] }
  }
  if (q.startsWith("INSERT INTO dashboard.workspace_agent_reminders")) {
    const withWait = q.includes("wait_id")
    db.reminders.push({
      id: params[0], space_id: params[1], thread_root: params[2], target_agent: params[3], from_agent: withWait ? params[3] : params[4],
      text: withWait ? params[4] : params[5], fire_at: withWait ? params[5] : params[6], credential_owner: withWait ? params[6] : params[7],
      missed_policy: withWait ? "run_once" : params[8], wait_id: withWait ? params[7] : null,
    })
    return { rows: [] }
  }
  // ── waits ──
  if (q.startsWith("INSERT INTO dashboard.workspace_agent_waits")) {
    db.waits.push({ id: params[0], space_id: params[1], thread_root: params[2], agent_type: params[3], task_id: params[4], request_text: params[5], note: params[6], credential_owner: params[7], status: "open", wake_count: 0, created_at: NOW })
    return { rows: [] }
  }
  if (q.includes("close_note = 'superseded by a newer wait'")) return { rows: [] }
  if (q.startsWith("UPDATE dashboard.workspace_agent_waits SET status = 'closed'")) {
    const rows = db.waits.filter((w) => w.status === "open" && w.thread_root === params[1] && w.agent_type === params[2] && (params[3] === null || w.id === params[3]))
    for (const w of rows) { w.status = "closed"; w.close_note = params[4] }
    return { rows: rows.map((w) => ({ id: w.id })) }
  }
  if (q.includes("FROM dashboard.workspace_agent_waits")) {
    const rows = db.waits.filter((w) => w.status === "open"
      && (params[1] === null || (params[1] as string[]).includes(String(w.id)))
      && (params[2] === null || w.thread_root === params[2])
      && (params[3] === null || w.agent_type === params[3]))
    return { rows: rows.map((w) => ({ ...w })) }
  }
  if (q.includes("SET wake_count = wake_count + 1")) {
    for (const w of db.waits) if ((params[0] as string[]).includes(String(w.id))) w.wake_count = Number(w.wake_count) + 1
    return { rows: [] }
  }
  // ── tasks / messages (same shapes as spaceAgentRun.team.test.ts) ──
  if (q.includes("FROM dashboard.workspace_agent_tasks WHERE id = $1")) return { rows: db.tasks.filter((t) => t.id === params[0]) }
  if (q.includes("SET status = 'in_progress'")) {
    const t = task(params[0])
    if (!t || !["todo", "failed"].includes(String(t.status))) return { rows: [] }
    t.status = "in_progress"; return { rows: [{ ...t }] }
  }
  if (q.startsWith("UPDATE dashboard.workspace_agent_tasks SET status = $2")) {
    const t = task(params[0])
    if (t) { t.status = params[1]; t.reason = params[2]; if (q.includes("result_msg")) t.result_msg = params.at(-1) }
    return { rows: [] }
  }
  if (q.includes("SET routed_at = now()")) {
    const rows = db.tasks.filter((t) => t.reply_to === params[1] && ["done", "failed"].includes(String(t.status)) && !t.routed_at)
    for (const t of rows) t.routed_at = NOW
    return { rows: rows.map((t) => ({ ...t })) }
  }
  if (q.includes("WHERE space_id = $1 AND reply_to = $2")) return { rows: db.tasks.filter((t) => t.reply_to === params[1]).map((t) => ({ ...t })) }
  if (q.includes("SELECT id, body FROM dashboard.workspace_messages")) {
    const ids = params[0] as string[]
    return { rows: db.messages.filter((m) => ids.includes(String(m.id))).map((m) => ({ id: m.id, body: m.body })) }
  }
  if (q.includes("FROM dashboard.workspace_agent_acl")) return { rows: db.acl.map((a) => ({ agent_type: a })) }
  if (q.includes("FROM dashboard.workspace_docs")) return { rows: [{ id: "s1", owner: "u1" }] }
  if (q.startsWith("INSERT INTO dashboard.workspace_agent_tasks")) {
    const t = taskRow({ agent_type: params[4], instruction: params[5], trigger_msg: params[3], reason: params[6], chain_root: params[8], chain_depth: params[9], kind: params[10], from_agent: params[11], reply_to: params[12] })
    db.tasks.push(t); return { rows: [t] }
  }
  if (q.startsWith("INSERT INTO dashboard.workspace_messages")) {
    const m = { id: params[0], space_id: params[1], thread_root: params[2], author_kind: "agent", author_id: params[3], author_name: params[4], agent_type: params[3], body: params[5], mentions: params[6], member_ids: [], here: false, has_agent: params[9], doc_refs: [], created_at: NOW, edited_at: null, deleted_at: null }
    db.messages.push(m); return { rows: [m] }
  }
  return { rows: [], rowCount: 0 }
})

type Turn = { reply: string; team_actions?: unknown[]; run_outcome?: string; run_failure_reason?: string }
function backend(turnsBy: Record<string, Turn[]>) {
  const turns: { agent: string; text: string; turn_origin?: string; auth: string }[] = []
  const used: Record<string, number> = {}
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: { body?: unknown; headers: Record<string, string> }) => {
    const body = JSON.parse(String(init.body)) as { agent_type: string; text: string; turn_origin?: string }
    turns.push({ agent: body.agent_type, text: body.text, turn_origin: body.turn_origin, auth: init.headers.Authorization })
    const list = turnsBy[body.agent_type] ?? [{ reply: "ok" }]
    const i = used[body.agent_type] ?? 0; used[body.agent_type] = i + 1
    const t = list[Math.min(i, list.length - 1)]
    return { ok: true, json: async () => ({ reply: t.reply, pending_approval: null, team_actions: t.team_actions ?? [], run_outcome: t.run_outcome ?? null, run_failure_reason: t.run_failure_reason ?? null }) }
  }))
  return turns
}
const settle = () => new Promise((r) => setTimeout(r, 30))

beforeEach(() => {
  db.tasks = []; db.messages = []; db.reminders = []; db.waits = []; db.acl = ["autonomous", "leads_qualifier"]; db.seq = 0
  db.now = Date.parse(NOW)
  // Planning reads the clock; only Date is faked, so the settle timeouts still run.
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(db.now)
  queryMock.mockClear()
})

describe("unattended runs (ADR-021 §4.3)", () => {
  it("a quiet reminder turn posts nothing and is done", async () => {
    const turns = backend({ autonomous: [{ reply: "Tidak ada lead baru.", run_outcome: "quiet" }] })
    db.tasks.push(taskRow({ id: "t0", kind: "reminder", from_agent: "autonomous" }))
    const out = await runAgentTask({ spaceId: "s1", taskId: "t0", credential })
    expect(turns[0].turn_origin).toBe("reminder")
    expect(out.status).toBe(200)
    expect(db.messages).toHaveLength(0)
    expect(db.tasks[0].status).toBe("done")
    expect(db.tasks[0].reason).toBe("quiet run: nothing to report")
  })

  it("a quiet run still carries out its team actions", async () => {
    backend({ autonomous: [{ reply: "", run_outcome: "quiet", team_actions: [{ kind: "remind", to: "self", text: "cek lagi", when: "in 1d" }] }] })
    db.tasks.push(taskRow({ id: "t0", kind: "reminder" }))
    await runAgentTask({ spaceId: "s1", taskId: "t0", credential })
    expect(db.reminders).toHaveLength(1)
    expect(db.reminders[0].credential_owner).toBe("u1")
  })

  it("a failed run is posted with its reason and marked failed", async () => {
    backend({ autonomous: [{ reply: "Odoo tidak bisa dihubungi.", run_outcome: "failed", run_failure_reason: "Odoo unreachable" }] })
    db.tasks.push(taskRow({ id: "t0", kind: "wake" }))
    await runAgentTask({ spaceId: "s1", taskId: "t0", credential })
    expect(String(db.messages[0].body)).toMatch(/^⚠️ Could not complete this run: Odoo unreachable\n\nOdoo tidak bisa dihubungi\./)
    expect(db.tasks[0].status).toBe("failed")
    expect(db.tasks[0].reason).toBe("run failed: Odoo unreachable")
  })

  it("a conversation turn ignores a run outcome and is not sent as unattended", async () => {
    const turns = backend({ autonomous: [{ reply: "Halo!", run_outcome: "quiet" }] })
    db.tasks.push(taskRow({ id: "t0", kind: "mention" }))
    await runAgentTask({ spaceId: "s1", taskId: "t0", credential })
    expect(turns[0].turn_origin).toBeUndefined()
    expect(db.messages[0].body).toBe("Halo!")
    expect(db.tasks[0].status).toBe("done")
  })
})

describe("reminders fired for one member (ADR-021 §4.1)", () => {
  it("stores the credential owner and missed policy, and fires only that owner's reminders", async () => {
    const turns = backend({ autonomous: [{ reply: "Sudah dicek." }] })
    db.reminders.push(
      { id: "r1", space_id: "s1", thread_root: "root1", target_agent: "autonomous", from_agent: "autonomous", text: "cek invoice", fire_at: NOW, credential_owner: "u1", missed_policy: "run_once" },
      { id: "r2", space_id: "s1", thread_root: "root1", target_agent: "autonomous", from_agent: "autonomous", text: "punya orang lain", fire_at: NOW, credential_owner: "u2", missed_policy: "run_once" },
    )
    expect(await fireDueReminders("s1", credential, { owner: "u1" })).toBe(1)
    await settle()
    expect(db.reminders.find((r) => r.id === "r2")?.fired_at).toBeUndefined()
    expect(turns).toHaveLength(1)
    expect(turns[0].auth).toBe("Bearer minted")
    expect(turns[0].turn_origin).toBe("reminder")
    expect(turns[0].text).toContain("[Reminder]\ncek invoice")
  })

  it("a late run_once reminder fires once and says so; a late skip reminder does not fire", async () => {
    const turns = backend({ autonomous: [{ reply: "ok" }] })
    const anHourAgo = new Date(db.now - 3_600_000).toISOString()
    db.reminders.push(
      { id: "r1", space_id: "s1", thread_root: "root1", target_agent: "autonomous", from_agent: "autonomous", text: "kirim laporan", fire_at: anHourAgo, credential_owner: "u1", missed_policy: "run_once" },
      { id: "r2", space_id: "s1", thread_root: "root1", target_agent: "autonomous", from_agent: "autonomous", text: "standup", fire_at: anHourAgo, credential_owner: "u1", missed_policy: "skip" },
    )
    expect(await fireDueReminders("s1", credential)).toBe(1)
    await settle()
    expect(turns).toHaveLength(1)
    expect(turns[0].text).toContain("fires late")
    expect(String(db.messages[0].body)).toContain("_(late)_")
    expect(db.reminders.find((r) => r.id === "r2")?.fire_outcome).toBe("skipped")
  })
})

describe("waits (ADR-021 §4.2)", () => {
  it("team_wait keeps the request, and its timed wake repeats it", async () => {
    const turns = backend({
      autonomous: [
        { reply: "Saya tunggu harga dari Lex.", team_actions: [{ kind: "wait", to: "self", text: "tunggu harga dari Lex", when: "in 2h" }] },
        { reply: "Harga sudah ada, penawaran dikirim.", team_actions: [{ kind: "wait_close", to: "self", text: "terkirim" }] },
      ],
    })
    db.tasks.push(taskRow({ id: "t0", instruction: "Lex asks you.\n[Question from Lex]\nKirim penawaran ke Toko Melati" }))
    await runAgentTask({ spaceId: "s1", taskId: "t0", credential })
    expect(db.waits).toHaveLength(1)
    expect(db.waits[0].request_text).toBe("Kirim penawaran ke Toko Melati")
    expect(db.waits[0].credential_owner).toBe("u1")
    const wake = db.reminders.find((r) => r.wait_id === db.waits[0].id)
    expect(wake?.fire_at).toBe("2026-10-26T12:00:00.000Z")
    expect(db.messages.some((m) => String(m.body).startsWith("⏳ Waiting: tunggu harga dari Lex"))).toBe(true)

    db.now = Date.parse("2026-10-26T12:00:30Z")
    expect(await fireDueReminders("s1", credential, { owner: "u1" })).toBe(1)
    await settle(); await settle()
    const woken = turns.at(-1)!
    expect(woken.turn_origin).toBe("wake")
    expect(woken.text).toContain("its time came")
    expect(woken.text).toContain("[Original request]\nKirim penawaran ke Toko Melati\n[Your note]\ntunggu harga dari Lex")
    expect(db.waits[0].wake_count).toBe(1)
    // The woken turn closed the wait.
    expect(db.waits[0].status).toBe("closed")
    expect(db.waits[0].close_note).toBe("terkirim")
  })

  it("a webhook wakes an open wait through a due reminder, and not a closed one", async () => {
    const turns = backend({ autonomous: [{ reply: "Build lulus, lanjut deploy." }] })
    db.waits.push({ id: "w_1", space_id: "s1", thread_root: "root1", agent_type: "autonomous", request_text: "deploy versi baru", note: "tunggu build", credential_owner: "u1", status: "open", wake_count: 0, created_at: NOW })
    expect(await requestWake("s1", "w_1", "build 412 passed")).toBe(true)
    expect(await requestWake("s1", "w_missing", "x")).toBe(false)
    expect(await fireDueReminders("s1", credential, { owner: "u1" })).toBe(1)
    await settle()
    expect(turns[0].text).toContain("an outside event woke it (build 412 passed)")
    expect(turns[0].text).toContain("[Original request]\ndeploy versi baru")
  })

  it("closing a wait cancels its pending wake", async () => {
    backend({ autonomous: [{ reply: "Tidak perlu lagi.", team_actions: [{ kind: "wait_close", to: "self", text: "", wait_id: "w_1" }] }] })
    db.waits.push({ id: "w_1", space_id: "s1", thread_root: "root1", agent_type: "autonomous", request_text: "r", note: "n", credential_owner: "u1", status: "open", wake_count: 0, created_at: NOW })
    db.reminders.push({ id: "r1", space_id: "s1", thread_root: "root1", target_agent: "autonomous", from_agent: "autonomous", text: "n", fire_at: "2026-10-27T10:00:00.000Z", credential_owner: "u1", wait_id: "w_1" })
    db.tasks.push(taskRow({ id: "t0" }))
    await runAgentTask({ spaceId: "s1", taskId: "t0", credential })
    expect(db.waits[0].status).toBe("closed")
    expect(db.reminders[0].fire_outcome).toBe("skipped")
  })

  it("a finished delegate shows the delegator its open waits", async () => {
    const turns = backend({
      autonomous: [
        { reply: "Lex, tolong cek.", team_actions: [{ kind: "delegate", to: "Lex", text: "cek kualifikasi Toko Melati" }] },
        { reply: "Lanjut." },
      ],
      leads_qualifier: [{ reply: "Status: done\nResult: qualified\nEvidence: none" }],
    })
    db.waits.push({ id: "w_1", space_id: "s1", thread_root: "root1", agent_type: "autonomous", request_text: "kirim penawaran", note: "tunggu kualifikasi Lex", credential_owner: "u1", status: "open", wake_count: 0, created_at: NOW })
    db.tasks.push(taskRow({ id: "t0" }))
    await runAgentTask({ spaceId: "s1", taskId: "t0", credential })
    await settle(); await settle()
    const report = turns.at(-1)!
    expect(report.agent).toBe("autonomous")
    expect(report.text).toContain("[Report from Lex]")
    expect(report.text).toContain("[Wait w_1 since")
    expect(db.waits[0].wake_count).toBe(1)
  })
})
