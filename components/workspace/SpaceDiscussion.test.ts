/**
 * @vitest-environment jsdom
 * Regression: thread/draft isolation + live polling guards.
 */
import React from "react"
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useDiscussionResource } from "@/hooks/useDiscussionResource"
import SpaceDiscussion from "./SpaceDiscussion"

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))
vi.mock("@/lib/collabClient", () => ({ collabAuthHeaders: () => ({}) }))
vi.mock("@/hooks/useWorkspaceAwareness", () => ({ useWorkspaceAwareness: () => [] }))
vi.mock("./SpaceAgentPanel", () => ({ default: () => null }))
vi.mock("@/components/office/AgentAvatar", () => ({ AgentAvatar: () => null }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status })
}
function message(id: string, body = id) {
  return { id, body, createdAt: new Date().toISOString(), author: { actingMode: "human", memberId: "Alice" } }
}
function thread(id: string, replies: ReturnType<typeof message>[] = []) {
  return { root: message(id), replies, topic: null }
}
async function settle() {
  await act(async () => { await Promise.resolve() })
}
const props = { spaceId: "one", workspaceId: null, initialThread: "A", canWrite: true }

beforeEach(() => {
  vi.stubGlobal("React", React)
  Object.defineProperty(document, "hidden", { configurable: true, value: false })
  vi.clearAllMocks()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("discussion resource", () => {
  it("ignores obsolete responses and callbacks after A/B navigation", async () => {
    const a = deferred<Response>()
    const fetcher = vi.fn((url: string) => url === "/A" ? a.promise : Promise.resolve(response({ id: "B" })))
    vi.stubGlobal("fetch", fetcher)
    const view = renderHook(({ url }) => useDiscussionResource<{ id: string }>(url), { initialProps: { url: "/A" } })
    const staleRefresh = view.result.current.refresh
    view.rerender({ url: "/B" })
    await settle()
    expect(view.result.current.data?.id).toBe("B")
    await act(async () => { a.resolve(response({ id: "A" })); await a.promise })
    await staleRefresh()
    expect(view.result.current.data?.id).toBe("B")
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[0][0]).toBe("/A")
  })

  it("polls without overlap or flicker, pauses hidden, refreshes on focus and cleans up", async () => {
    vi.useFakeTimers()
    const pending = deferred<Response>()
    const fetcher = vi.fn().mockResolvedValueOnce(response({ count: 1 })).mockReturnValueOnce(pending.promise)
      .mockImplementation(() => Promise.resolve(response({ count: 3 })))
    vi.stubGlobal("fetch", fetcher)
    const view = renderHook(() => useDiscussionResource<{ count: number }>("/stream"))
    await settle()
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(view.result.current.loading).toBe(false)
    expect(view.result.current.data?.count).toBe(1)
    await act(async () => { vi.advanceTimersByTime(15000); window.dispatchEvent(new Event("focus")) })
    expect(fetcher).toHaveBeenCalledTimes(2)
    await act(async () => { pending.resolve(response({ count: 2 })); await pending.promise })
    Object.defineProperty(document, "hidden", { configurable: true, value: true })
    await act(async () => { vi.advanceTimersByTime(10000) })
    expect(fetcher).toHaveBeenCalledTimes(2)
    Object.defineProperty(document, "hidden", { configurable: true, value: false })
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")) })
    expect(fetcher).toHaveBeenCalledTimes(3)
    await act(async () => { window.dispatchEvent(new Event("focus")) })
    expect(fetcher).toHaveBeenCalledTimes(4)
    view.unmount()
    await act(async () => { vi.advanceTimersByTime(10000); window.dispatchEvent(new Event("focus")) })
    expect(fetcher).toHaveBeenCalledTimes(4)
  })
})

describe("conversation isolation", () => {
  it("preserves per-thread drafts and isolates an old send completion and URL changes", async () => {
    const sent = deferred<Response>()
    const fetcher = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") return sent.promise
      if (url.includes("/thread?")) return Promise.resolve(response(thread(new URL(url, "http://localhost").searchParams.get("root")!)))
      return Promise.resolve(response({ roots: [], docs: [] }))
    })
    vi.stubGlobal("fetch", fetcher)
    const view = render(React.createElement(SpaceDiscussion, props))
    await settle()
    fireEvent.change(screen.getByPlaceholderText("Reply… @ for agents"), { target: { value: "draft A" } })
    fireEvent.change(screen.getByPlaceholderText("Thread goal title…"), { target: { value: "goal A" } })
    fireEvent.keyDown(screen.getByPlaceholderText("Reply… @ for agents"), { key: "Enter" })
    view.rerender(React.createElement(SpaceDiscussion, { ...props, initialThread: "B" }))
    await settle()
    expect((screen.getByPlaceholderText("Reply… @ for agents") as HTMLTextAreaElement).value).toBe("")
    expect((screen.getByPlaceholderText("Thread goal title…") as HTMLInputElement).value).toBe("")
    fireEvent.change(screen.getByPlaceholderText("Reply… @ for agents"), { target: { value: "draft B" } })
    await act(async () => { sent.resolve(response({ ok: true })); await sent.promise })
    expect((screen.getByPlaceholderText("Reply… @ for agents") as HTMLTextAreaElement).value).toBe("draft B")
    expect(screen.queryByText("Hello from A", { exact: false })).toBeNull()
    expect(fetcher.mock.calls.filter(([url]) => url.includes("root=A"))).toHaveLength(1)
    const mutation = fetcher.mock.calls.find(([, init]) => init?.method === "POST")!
    expect(JSON.parse(mutation[1]!.body as string)).toEqual({ threadRoot: "A", body: "draft A" })
    view.rerender(React.createElement(SpaceDiscussion, props))
    await settle()
    expect((screen.getByPlaceholderText("Thread goal title…") as HTMLInputElement).value).toBe("goal A")
    view.rerender(React.createElement(SpaceDiscussion, { ...props, initialThread: "B" }))
    await settle()
    expect((screen.getByPlaceholderText("Reply… @ for agents") as HTMLTextAreaElement).value).toBe("draft B")
    view.rerender(React.createElement(SpaceDiscussion, { ...props, initialThread: null }))
    expect(screen.queryByPlaceholderText("Reply… @ for agents")).toBeNull()
  })

  it("renders human replies on polling without resetting composer or scroll", async () => {
    vi.useFakeTimers()
    let replies: ReturnType<typeof message>[] = []
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(response(url.includes("/thread?") ? thread("A", replies) : { roots: [], docs: [] }))))
    const view = render(React.createElement(SpaceDiscussion, props))
    await settle()
    const composer = screen.getByPlaceholderText("Reply… @ for agents") as HTMLTextAreaElement
    fireEvent.change(composer, { target: { value: "unsent" } })
    const panel = view.container.querySelector(".overflow-y-auto")!
    panel.scrollTop = 120
    replies = [message("human-reply", "Hello from Bob")]
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(screen.getByText("Hello from Bob")).toBeTruthy()
    expect(screen.getByPlaceholderText("Reply… @ for agents")).toBe(composer)
    expect(composer.value).toBe("unsent")
    expect(panel.scrollTop).toBe(120)
    expect(screen.queryByText("Loading thread…")).toBeNull()
  })

  it("blocks sends until the matching thread loads and resets space state", async () => {
    const pending = deferred<Response>()
    vi.stubGlobal("fetch", vi.fn((url: string) => url.includes("/two/thread") ? pending.promise : Promise.resolve(response(url.includes("/thread?") ? thread("A") : { roots: [], docs: [] }))))
    const view = render(React.createElement(SpaceDiscussion, props))
    await settle()
    fireEvent.change(screen.getByPlaceholderText("Reply… @ for agents"), { target: { value: "private A" } })
    view.rerender(React.createElement(SpaceDiscussion, { ...props, spaceId: "two" }))
    expect(screen.queryByText("Hello from A", { exact: false })).toBeNull()
    expect(screen.getAllByRole("textbox").some((el) => (el as HTMLTextAreaElement).value === "private A")).toBe(false)
    expect((screen.getAllByRole("textbox")[1] as HTMLTextAreaElement).disabled).toBe(true)
    await act(async () => { pending.resolve(response(thread("A"))); await pending.promise })
    expect((screen.getByPlaceholderText("Reply… @ for agents") as HTMLTextAreaElement).value).toBe("")
  })
})
