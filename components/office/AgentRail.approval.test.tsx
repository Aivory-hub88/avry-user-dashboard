/**
 * @vitest-environment jsdom
 * The rail's approval card carries real Approve/Deny buttons (typing "Ya" in
 * chat only works when it reaches the agent that parked the call).
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react"

vi.mock("next/image", () => ({ default: () => null }))
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }))
vi.mock("@/hooks/useWorkspaceAwareness", () => ({ useWorkspaceAwareness: () => [] }))
vi.mock("@/components/office/MemoryModal", () => ({ MemoryModal: () => null }))

import AgentRail from "./AgentRail"

const approval = {
  id: "pa_1",
  principal: "u1",
  tool_name: "composio-googledrive-share__GOOGLEDRIVE_CREATE_PERMISSION",
  arguments: {},
  risk_tier: "irreversible",
  requested_at: new Date().toISOString(),
  status: "pending",
  resolved_at: null,
  resolved_by: null,
  _agent_type: "autonomous",
}

function renderRail(onResolveApproval?: (a: unknown, d: "approve" | "deny") => Promise<void>) {
  return render(
    <AgentRail
      workspaceId={null}
      agentTarget="autonomous"
      notifications={[{ id: "pa_1", kind: "approval", agentType: "autonomous", approval }]}
      approvalsError={false}
      onRetryApprovals={() => {}}
      onOpenThread={() => {}}
      deployments={[{ agentType: "autonomous", kind: "telegram" } as never]}
      onResolveApproval={onResolveApproval as never}
    />,
  )
}

afterEach(cleanup)

describe("AgentRail approval card", () => {
  it("approves with the card's own button", async () => {
    const resolve = vi.fn(async () => {})
    renderRail(resolve)
    fireEvent.click(screen.getByRole("button", { name: "Setujui" }))
    await waitFor(() => expect(resolve).toHaveBeenCalledWith(approval, "approve"))
  })

  it("denies with the Batal button", async () => {
    const resolve = vi.fn(async () => {})
    renderRail(resolve)
    fireEvent.click(screen.getByRole("button", { name: "Batal" }))
    await waitFor(() => expect(resolve).toHaveBeenCalledWith(approval, "deny"))
  })

  it("says so when the decision could not be sent", async () => {
    renderRail(vi.fn(async () => { throw new Error("502") }))
    fireEvent.click(screen.getByRole("button", { name: "Setujui" }))
    expect(await screen.findByText(/Couldn't send your decision/)).toBeTruthy()
  })

  it("keeps the chat way of deciding next to the buttons", () => {
    renderRail(vi.fn(async () => {}))
    expect(screen.getByText(/di chat untuk menyetujui/)).toBeTruthy()
  })

  it("shows only the chat hint when no handler is wired", () => {
    renderRail(undefined)
    expect(screen.queryByRole("button", { name: "Setujui" })).toBeNull()
    expect(screen.getByText(/di chat untuk menyetujui/)).toBeTruthy()
  })
})
