import { describe, it, expect } from "vitest"
import { timeAgo, placeMenu, KIND_META, POLL_MS } from "@/lib/spaceUi"

describe("timeAgo", () => {
  it("formats compact units", () => {
    const now = Date.now()
    expect(timeAgo(new Date(now - 11_000).toISOString())).toBe("11s")
    expect(timeAgo(new Date(now - 5 * 60_000).toISOString())).toBe("5m")
    expect(timeAgo(new Date(now - 3 * 3_600_000).toISOString())).toBe("3h")
    expect(timeAgo(new Date(now - 2 * 86_400_000).toISOString())).toBe("2d")
    expect(timeAgo("bukan-tanggal")).toBe("")
  })
})

describe("placeMenu", () => {
  it("opens above roomy anchors", () => {
    const p = placeMenu({ top: 600, bottom: 640, left: 100 }, 1280, 800)
    expect(p.bottom).toBe(800 - 600 + 4)
    expect(p.top).toBeUndefined()
    expect(p.width).toBe(300)
  })

  it("flips below cramped anchors", () => {
    const p = placeMenu({ top: 100, bottom: 140, left: 100 }, 1280, 800)
    expect(p.top).toBe(144)
    expect(p.bottom).toBeUndefined()
  })

  it("clamps to narrow viewports", () => {
    const p = placeMenu({ top: 600, bottom: 640, left: 1200 }, 1280, 800)
    expect(p.left).toBeLessThanOrEqual(1280 - 316)
    expect(p.width).toBeLessThanOrEqual(1280 - 16)
  })
})

describe("spaceUi constants", () => {
  it("covers every activity kind + sane polls", () => {
    expect(Object.keys(KIND_META).sort()).toEqual(["here", "mention", "reply"])
    expect(POLL_MS.agentPanel).toBeLessThan(POLL_MS.activityPanel)
    expect(POLL_MS.activityPanel).toBeLessThanOrEqual(POLL_MS.bell)
  })
})
