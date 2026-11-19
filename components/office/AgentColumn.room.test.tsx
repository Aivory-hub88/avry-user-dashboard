/**
 * @vitest-environment jsdom
 * In the group Room agentTarget is null, which equals the Aivory Console row's
 * type. Clicking Aivory there must leave the Room, not just toggle its dropdown.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"

vi.mock("next/image", () => ({ default: () => null }))

import AgentColumn from "./AgentColumn"

function setup(currentSessionId: string) {
  const startNew = vi.fn()
  const switchSession = vi.fn()
  const setAgentTarget = vi.fn()
  render(
    <AgentColumn
      sessionsByAgent={{}}
      notificationsByAgent={{}}
      notificationsLoaded
      deployments={[]}
      currentSessionId={currentSessionId}
      agentTarget={null}
      streamingAgentType={undefined}
      activeRunsByAgentType={{}}
      setAgentTarget={setAgentTarget}
      switchSession={switchSession}
      handleNewChat={startNew}
      deleteThread={vi.fn()}
      roomSessionId="room-1"
    />,
  )
  return { startNew, setAgentTarget }
}

afterEach(cleanup)

describe("AgentColumn Aivory row", () => {
  it("leaves the Room (fresh Direct chat) when clicked from the Room", () => {
    const { startNew, setAgentTarget } = setup("room-1")
    fireEvent.click(screen.getByText("Aivory Console"))
    expect(startNew).toHaveBeenCalledTimes(1)
    expect(setAgentTarget).toHaveBeenCalledWith(null)
  })

  it("only toggles its dropdown when already on the Console thread", () => {
    const { startNew } = setup("console-1")
    fireEvent.click(screen.getByText("Aivory Console"))
    expect(startNew).not.toHaveBeenCalled()
  })
})
