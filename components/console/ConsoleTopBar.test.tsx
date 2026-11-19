/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"

vi.mock("@/contexts/ModeContext", () => ({ useMode: () => ({ agentTarget: null }) }))

import ConsoleTopBar from "./ConsoleTopBar"

afterEach(cleanup)

describe("ConsoleTopBar mode switch", () => {
  it("offers Direct, Agents and Group and reports the picked mode", () => {
    const onChange = vi.fn()
    render(<ConsoleTopBar onNewChat={vi.fn()} chatMode="direct" onChatModeChange={onChange} roomCount={6} />)
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Direct", "Agents", "Group · 6"])
    fireEvent.click(screen.getByRole("tab", { name: "Agents" }))
    fireEvent.click(screen.getByRole("tab", { name: /Group/ }))
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(["agents", "room"])
  })

  it("marks the active mode", () => {
    render(<ConsoleTopBar onNewChat={vi.fn()} chatMode="agents" onChatModeChange={vi.fn()} />)
    expect(screen.getByRole("tab", { name: "Agents" }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByRole("tab", { name: "Direct" }).getAttribute("aria-selected")).toBe("false")
  })
})
