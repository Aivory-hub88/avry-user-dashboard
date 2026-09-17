/**
 * Dispatcher Phase 3: stripInstruction + enqueue per-agent (dedupe).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))

vi.mock("@/lib/db", () => ({ query: queryMock }))

import { stripInstruction, spaceAgentTaskFromRow, buildSpacePayload } from "@/lib/spaceAgent"
import { enqueueAgentTasks } from "@/lib/spaceAgentStore"

beforeEach(() => {
  queryMock.mockReset()
})

describe("stripInstruction", () => {
  it("reduces tokens to plain labels", () => {
    expect(stripInstruction("Tolong [@Geno](#agent:autonomous) cek [#Launch](#doc:d1)")).toBe(
      "Tolong @Geno cek #Launch",
    )
  })
})

describe("enqueueAgentTasks", () => {
  const stamps = {
    agentTypes: ["autonomous", "finance_invoice_ops"],
    memberIds: [],
    here: false,
    docRefs: [],
    hasAgent: true,
  }
  const taskRow = (agent: string) => ({
    id: `task-${agent}`,
    space_id: "space-1",
    thread_root: "m1",
    trigger_msg: "m0",
    agent_type: agent,
    instruction: "Tolong @Geno cek",
    status: "todo",
    reason: "mention",
    result_msg: null,
    approval_ref: {},
    created_by: "user:u1",
    created_at: "2026-09-17T10:00:00.000Z",
    updated_at: "2026-09-17T10:00:00.000Z",
  })

  it("inserts one todo row per stamped agent", async () => {
    queryMock.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes("FROM dashboard.workspace_agent_tasks"))
        return Promise.resolve({ rows: [] })
      return Promise.resolve({ rows: [taskRow(params?.[4] as string)] })
    })
    const tasks = await enqueueAgentTasks({
      spaceId: "space-1",
      threadRoot: "m1",
      triggerMsg: "m0",
      stamps,
      body: "Tolong [@Geno](#agent:autonomous) cek",
      createdBy: "user:u1",
    })
    expect(tasks.map((t) => t.agentType)).toEqual(["autonomous", "finance_invoice_ops"])
    expect(tasks[0].status).toBe("todo")
    expect(tasks[0].reason.length).toBeGreaterThan(0)
  })

  it("skips agents with an already-open task (no duplicates)", async () => {
    queryMock.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes("FROM dashboard.workspace_agent_tasks"))
        return Promise.resolve({ rows: [{ agent_type: "autonomous" }] })
      return Promise.resolve({ rows: [taskRow(params?.[4] as string)] })
    })
    const tasks = await enqueueAgentTasks({
      spaceId: "space-1",
      threadRoot: "m1",
      triggerMsg: "m0",
      stamps,
      body: "Lagi [@Geno](#agent:autonomous) dan [@Finn](#agent:finance_invoice_ops)",
      createdBy: "user:u1",
    })
    expect(tasks.map((t) => t.agentType)).toEqual(["finance_invoice_ops"])
  })

  it("returns [] without agent stamps or instruction", async () => {
    expect(
      await enqueueAgentTasks({
        spaceId: "s",
        threadRoot: "m",
        triggerMsg: "m0",
        stamps: { agentTypes: [], memberIds: [], here: false, docRefs: [], hasAgent: false },
        body: "halo",
        createdBy: "user:u1",
      }),
    ).toEqual([])
    expect(queryMock).not.toHaveBeenCalled()
  })

  it("drops corrupt rows instead of throwing", () => {
    expect(spaceAgentTaskFromRow({ id: 1 } as unknown as Record<string, unknown>)).toBeNull()
  })
})

describe("buildSpacePayload", () => {
  it("carries who, transcript, and instruction", () => {
    const p = buildSpacePayload({
      me: "Geno",
      peers: ["Teo"],
      instruction: "Tolong @Geno cek",
      history: [
        { author: "Sarah", text: "launch cut Jumat?" },
        { author: "Geno", text: "Siap" },
      ],
    })
    expect(p).toContain("You are Geno")
    expect(p).toContain("Teo")
    expect(p).toContain("<thread_history>\nSarah: launch cut Jumat?")
    expect(p).toContain("<instruction>\nTolong @Geno cek\n</instruction>")
  })

  it("omits empty history and handles solo runs", () => {
    const p = buildSpacePayload({ me: "Finn", peers: [], instruction: "cek", history: [] })
    expect(p).toContain("only agent mentioned")
    expect(p).not.toContain("<thread_history>")
  })
})
