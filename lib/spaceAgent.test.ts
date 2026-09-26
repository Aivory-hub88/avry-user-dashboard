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
  it("carries transcript and instruction without channel coaching", () => {
    const p = buildSpacePayload({
      instruction: "Tolong @Geno cek",
      history: [
        { author: "Sarah", text: "launch cut Jumat?" },
        { author: "Geno", text: "Siap" },
      ],
    })
    expect(p).not.toContain("<space_context>")
    expect(p).not.toContain("You are Geno")
    expect(p).toContain("<thread_history>\nSarah: launch cut Jumat?")
    expect(p).toContain("<instruction>\nTolong @Geno cek\n</instruction>")
  })

  it("puts the room's brief, tasks, files and excerpts before the transcript (ADR-019 P3)", () => {
    const p = buildSpacePayload({
      instruction: "what is this project about?",
      history: [{ author: "Rina", text: "hi" }],
      room: {
        brief: "Project: Odoo rollout\nGoal: Move CRM to Odoo",
        tasks: "- Acme (Todo, City: Jakarta)",
        files: "- SOP.pdf",
        excerpts: [{ file: "SOP.pdf", text: "Import customers   before quotes." }],
      },
    })
    expect(p.indexOf("<room_brief>")).toBeLessThan(p.indexOf("<thread_history>"))
    expect(p).toContain("<room_brief>\nProject: Odoo rollout\nGoal: Move CRM to Odoo\n</room_brief>")
    expect(p).toContain("<room_tasks>\n- Acme (Todo, City: Jakarta)\n</room_tasks>")
    expect(p).toContain("<file_excerpts>\n[SOP.pdf]\nImport customers before quotes.\n</file_excerpts>")
  })

  it("skips empty room parts and caps long ones", () => {
    const p = buildSpacePayload({
      instruction: "x",
      history: [],
      room: { brief: "b".repeat(5000), tasks: "", files: "", excerpts: [] },
    })
    expect(p).not.toContain("<room_tasks>")
    expect(p).not.toContain("<file_excerpts>")
    expect(p.match(/<room_brief>\n(b+)…/)?.[1].length).toBe(1500)
  })

  it("omits empty history", () => {
    const p = buildSpacePayload({ instruction: "cek", history: [] })
    expect(p).not.toContain("<thread_history>")
    expect(p).toContain("<instruction>\ncek\n</instruction>")
  })
})
