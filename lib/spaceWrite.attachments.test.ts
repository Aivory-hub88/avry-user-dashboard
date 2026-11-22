import { describe, it, expect } from "vitest"
import { cleanAttachments } from "@/lib/spaceWrite"

const ok = { fileId: "f1", name: "a.png", mime: "image/png", size: 10 }

describe("cleanAttachments", () => {
  it("returns [] for non-arrays and drops malformed entries", () => {
    expect(cleanAttachments(undefined)).toEqual([])
    expect(cleanAttachments([null, "x", { name: "no id" }, { fileId: "f", name: "" }])).toEqual([])
  })
  it("keeps good entries and only small JPEG thumbs", () => {
    const thumb = "data:image/jpeg;base64,AAAA"
    expect(cleanAttachments([{ ...ok, thumb }])[0].thumb).toBe(thumb)
    expect(cleanAttachments([{ ...ok, thumb: "https://evil/x.png" }])[0].thumb).toBeUndefined()
    expect(cleanAttachments([{ ...ok, thumb: "data:image/jpeg;base64," + "A".repeat(130_000) }])[0].thumb).toBeUndefined()
  })
  it("caps at 10", () => {
    expect(cleanAttachments(Array.from({ length: 15 }, () => ok))).toHaveLength(10)
  })
})
