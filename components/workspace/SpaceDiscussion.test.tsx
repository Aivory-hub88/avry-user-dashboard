/**
 * @vitest-environment jsdom
 * Composer mention menu + thread delete affordance.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

vi.mock("@/hooks/useWorkspaceAwareness", () => ({
  useWorkspaceAwareness: () => [],
}))

vi.mock("@/lib/collabClient", () => ({
  collabAuthHeaders: () => ({}),
  clearClientAuthSession: () => {},
}))

import SpaceDiscussion from "./SpaceDiscussion"

const ROOT = {
  id: "m1",
  spaceId: "space-1",
  threadRoot: null,
  author: { memberId: "u1", actingMode: "user" },
  body: "Hello",
  stamps: { agentTypes: [], memberIds: [], here: false, docRefs: [], hasAgent: false },
  createdAt: new Date().toISOString(),
  replyCount: 0,
  topic: null,
}

function stubFetch() {
  return vi.fn(async (url: unknown, init?: { method?: string }) => {
    const u = String(url)
    if (u.includes("/stream"))
      return { ok: true, json: async () => ({ roots: [ROOT], truncated: false }) }
    if (u.endsWith("/api/workspace")) return { ok: true, json: async () => ({ docs: [] }) }
    if (u.includes("/thread?") && init?.method === "DELETE") return { ok: true, json: async () => ({ ok: true }) }
    return { ok: false, json: async () => ({}) }
  })
}

beforeEach(() => {
  vi.stubGlobal("fetch", stubFetch())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function openMenu() {
  render(
    <SpaceDiscussion spaceId="space-1" workspaceId={null} initialThread={null} canWrite />,
  )
  const box = (await screen.findByPlaceholderText(/Write an update/i)) as HTMLTextAreaElement
  box.selectionStart = 6
  fireEvent.change(box, { target: { value: "Halo @" } })
  await waitFor(() => {
    expect(screen.getByRole("listbox")).toBeDefined()
  })
  return box
}

describe("SpaceDiscussion composer", () => {
  it("opens the agent menu when typing @", async () => {
    await openMenu()
    expect(screen.getByText("Geno")).toBeDefined()
  })

  it("keeps the menu open across scroll (repositions instead)", async () => {
    await openMenu()
    fireEvent.scroll(window, { target: { scrollY: 200 } })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByRole("listbox")).toBeDefined()
    expect(screen.getByText("Geno")).toBeDefined()
  })

  it("delete asks Sure? first, deletes on confirm", async () => {
    render(
      <SpaceDiscussion spaceId="space-1" workspaceId={null} initialThread={null} canWrite />,
    )
    await screen.findByText("Hello")
    const bins = screen.getAllByTitle("Delete this thread and its replies")
    expect(bins.length).toBeGreaterThan(0)
    fireEvent.click(bins[0])
    expect(screen.getByText("Sure?")).toBeDefined()
    const fetchMock = vi.mocked(fetch)
    fireEvent.click(screen.getByText("Sure?"))
    await waitFor(() => {
      const dels = fetchMock.mock.calls.filter((c) => (c[1] as { method?: string } | undefined)?.method === "DELETE")
      expect(dels.length).toBeGreaterThan(0)
    })
  })
})
