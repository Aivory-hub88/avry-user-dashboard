/**
 * @vitest-environment jsdom
 * Mission Timeline: finished work belongs in the Done column.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor, within, cleanup } from "@testing-library/react"

const { authedFetchMock } = vi.hoisted(() => ({ authedFetchMock: vi.fn() }))
vi.mock("@/lib/deployAuth", () => ({ authedFetch: authedFetchMock }))

import MissionTimeline from "./MissionTimeline"

const NOW = Date.now()
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()

function task(over: Record<string, unknown>) {
  return {
    task_id: "t",
    tenant_id: "u1",
    agent_type: "leads_qualifier",
    session_id: "room-1",
    title: "A task",
    status: "in_progress",
    priority: "normal",
    blocked_reason: null,
    created_at: iso(600_000),
    updated_at: iso(300_000),
    is_parent: false,
    overdue: false,
    elapsed_ms: 300_000,
    ...over,
  }
}

const RUNNING = task({ task_id: "r", title: "Reconcile invoices", agent_type: "finance_invoice_ops" })
const WAITING = task({
  task_id: "w",
  title: "Book the meeting room",
  status: "blocked",
  blocked_reason: "Delegation timed out",
})
const DONE_DELEGATED = task({
  task_id: "d1",
  title: "Delegated to leads_qualifier: qualify the new leads",
  status: "done",
  elapsed_ms: 4 * 60_000, // it took four minutes
  result_summary: "qualified 3 leads",
})
const DONE_PLAIN = task({
  task_id: "d2",
  title: "Reply to ticket #4471",
  agent_type: "customer_service",
  status: "done",
  elapsed_ms: 30_000,
})

function respondWith(tasks: ReturnType<typeof task>[]) {
  const col = (s: string) => tasks.filter((t) => t.status === s)
  authedFetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      tasks,
      columns: { todo: col("todo"), in_progress: col("in_progress"), blocked: col("blocked"), done: col("done") },
      counts: {
        todo: col("todo").length,
        in_progress: col("in_progress").length,
        blocked: col("blocked").length,
        done: col("done").length,
        total: tasks.length,
      },
      orchestrations: [],
      sla: { child_minutes: 15, parent_minutes: 60 },
    }),
  })
}

/** The column container whose header reads `title`. */
function column(title: string): HTMLElement {
  const header = screen.getAllByText(title).find((el) => el.getAttribute("title") !== null || el.tagName === "SPAN")
  return header!.closest("div.rounded-2xl") as HTMLElement
}

beforeEach(() => authedFetchMock.mockReset())
afterEach(cleanup)

describe("MissionTimeline — Done column", () => {
  it("lists finished tasks under Done, with how long they took and their result", async () => {
    respondWith([RUNNING, WAITING, DONE_DELEGATED, DONE_PLAIN])
    render(<MissionTimeline variant="full" />)
    await waitFor(() => expect(screen.getByText(/qualify the new leads/)).toBeTruthy())

    const done = within(column("Done"))
    expect(done.getByText(/qualify the new leads/)).toBeTruthy()
    expect(done.getByText("Reply to ticket #4471")).toBeTruthy()
    expect(done.getByText("Result: qualified 3 leads")).toBeTruthy()
    expect(done.getByText("took 4m")).toBeTruthy()
    // a finished card does not claim time is still "elapsed"
    expect(done.queryByText(/elapsed/)).toBeNull()
  })

  it("keeps running and waiting work in their own columns, not under Done", async () => {
    respondWith([RUNNING, WAITING, DONE_DELEGATED])
    render(<MissionTimeline variant="full" />)
    await waitFor(() => expect(screen.getByText("Reconcile invoices")).toBeTruthy())
    expect(within(column("Running")).getByText("Reconcile invoices")).toBeTruthy()
    expect(within(column("Waiting")).getByText("Book the meeting room")).toBeTruthy()
    expect(within(column("Done")).queryByText("Reconcile invoices")).toBeNull()
    // open work still says elapsed
    expect(within(column("Running")).getByText("5m elapsed")).toBeTruthy()
  })

  it("a board with only finished work is not the empty state", async () => {
    respondWith([DONE_PLAIN])
    render(<MissionTimeline variant="full" />)
    await waitFor(() => expect(screen.getByText("Reply to ticket #4471")).toBeTruthy())
    expect(screen.queryByText(/No missions yet/)).toBeNull()
    expect(screen.getByText("1 task")).toBeTruthy()
  })

  it("shows the empty state only when there is truly nothing", async () => {
    respondWith([])
    render(<MissionTimeline variant="full" />)
    await waitFor(() => expect(screen.getByText(/No missions yet/)).toBeTruthy())
  })
})
