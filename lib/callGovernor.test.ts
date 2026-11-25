import { describe, expect, it } from "vitest"
import { CallGovernor, backoffMs, classifyFailure } from "./callGovernor"

const tick = () => new Promise((r) => setTimeout(r, 0))

describe("CallGovernor", () => {
  it("runs up to the limit at once and queues the rest", async () => {
    const g = new CallGovernor({ initial: 2, min: 1, max: 4 })
    const a = await g.acquire(0)
    const b = await g.acquire(1)
    expect(g.inFlight).toBe(2)
    let third = false
    void g.acquire(2).then(() => (third = true))
    await tick()
    expect(third).toBe(false)
    expect(g.queued).toBe(1)
    a.release("ok")
    await tick()
    expect(third).toBe(true)
    b.release("ok")
  })

  it("hands a freed slot to the best rank, not the first in line", async () => {
    const g = new CallGovernor({ initial: 1, min: 1, max: 1 })
    const first = await g.acquire(0)
    const order: string[] = []
    void g.acquire(5).then((s) => (order.push("low"), s.release("ok")))
    void g.acquire(1).then((s) => (order.push("high"), s.release("ok")))
    await tick()
    first.release("ok")
    await tick()
    await tick()
    expect(order).toEqual(["high", "low"])
  })

  it("ages a waiting call so newer high-priority work cannot starve it", async () => {
    let t = 0
    const g = new CallGovernor({ initial: 1, min: 1, max: 1, agingMs: 1000, now: () => t })
    const first = await g.acquire(0)
    const order: string[] = []
    void g.acquire(3).then((s) => (order.push("old-low"), s.release("ok")))
    t = 5000 // the low-priority call has waited 5 ranks' worth
    void g.acquire(1).then((s) => (order.push("new-high"), s.release("ok")))
    first.release("ok")
    await tick()
    await tick()
    expect(order).toEqual(["old-low", "new-high"])
  })

  it("grants a same-tick burst by rank, not by who called first", async () => {
    const g = new CallGovernor({ initial: 2, min: 1, max: 4 })
    const started: number[] = []
    const ranks = [5, 0, 3, 1]
    ranks.forEach((r) => void g.acquire(r).then(() => started.push(r)))
    await tick()
    expect(started.sort((a, b) => a - b)).toEqual([0, 1])
    expect(g.queued).toBe(2)
  })

  it("halves the limit on a rate limit and wins it back after clean calls", async () => {
    const g = new CallGovernor({ initial: 8, min: 2, max: 10, recoverAfter: 2 })
    const s = await g.acquire(0)
    s.release("rate_limited")
    expect(g.currentLimit).toBe(4)
    for (let i = 0; i < 2; i++) (await g.acquire(0)).release("ok")
    expect(g.currentLimit).toBe(5)
    for (let i = 0; i < 4; i++) (await g.acquire(0)).release("rate_limited")
    expect(g.currentLimit).toBe(2) // never below min
  })

  it("does not change the limit for a plain error, and ignores a double release", async () => {
    const g = new CallGovernor({ initial: 4, min: 2, max: 8 })
    const s = await g.acquire(0)
    s.release("error")
    s.release("rate_limited")
    expect(g.currentLimit).toBe(4)
    expect(g.inFlight).toBe(0)
  })

  it("reports each waiter's place in line and rejects an aborted wait", async () => {
    const g = new CallGovernor({ initial: 1, min: 1, max: 1 })
    const held = await g.acquire(0)
    const places: number[] = []
    const ac = new AbortController()
    const waiting = g.acquire(2, { signal: ac.signal, onPosition: (p) => places.push(p) })
    void g.acquire(1)
    await tick()
    ac.abort()
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" })
    expect(places[0]).toBe(2) // registered behind the rank-1 caller that arrived in the same tick
    expect(g.queued).toBe(1)
    held.release("ok")
  })

  it("rejects immediately when already aborted", async () => {
    const g = new CallGovernor()
    const ac = new AbortController()
    ac.abort()
    await expect(g.acquire(0, { signal: ac.signal })).rejects.toMatchObject({ name: "AbortError" })
  })
})

describe("classifyFailure / backoffMs", () => {
  it("separates slow-down, hiccup and fatal failures", () => {
    expect(classifyFailure(new Error("Agent chat failed (429)"))).toBe("rate_limited")
    expect(classifyFailure(new Error("Rate limit exceeded for key"))).toBe("rate_limited")
    expect(classifyFailure(new Error("Agent chat failed (503)"))).toBe("transient")
    expect(classifyFailure(new Error("Failed to fetch"))).toBe("transient")
    expect(classifyFailure(new Error("Agent not deployed"))).toBe("fatal")
    const abort = new Error("x")
    abort.name = "AbortError"
    expect(classifyFailure(abort)).toBe("fatal")
  })

  it("backs off exponentially with a cap and bounded jitter", () => {
    expect(backoffMs(1, () => 0)).toBe(1500)
    expect(backoffMs(2, () => 0)).toBe(3000)
    expect(backoffMs(9, () => 0)).toBe(10_000)
    expect(backoffMs(1, () => 1)).toBe(1875)
  })
})
