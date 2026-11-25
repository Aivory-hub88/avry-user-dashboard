import { describe, expect, it } from "vitest"
import { isLikelyHallucination } from "./transcriptFilter"

const names = ["Nova", "Atlas", "Sage", "Echo", "Pixel"]

describe("isLikelyHallucination", () => {
  it("drops empty and stock silence phrases", () => {
    expect(isLikelyHallucination("  ")).toBe(true)
    expect(isLikelyHallucination("Terima kasih telah menonton!")).toBe(true)
    expect(isLikelyHallucination("Thanks for watching.")).toBe(true)
    expect(isLikelyHallucination("you")).toBe(true)
  })
  it("drops the recognition prompt read back", () => {
    expect(isLikelyHallucination("Nama dan istilah: Nova, Atlas.")).toBe(true)
    expect(isLikelyHallucination("Nova, Atlas, Sage, Echo", names)).toBe(true)
  })
  it("keeps real speech, including a single agent name", () => {
    expect(isLikelyHallucination("Nova", names)).toBe(false)
    expect(isLikelyHallucination("tolong buatkan workflow untuk lead baru", names)).toBe(false)
    expect(
      isLikelyHallucination(
        "di akhir video ada kalimat thanks for watching tapi tolong jangan dipakai di naskah final kita ya",
      ),
    ).toBe(false)
  })
})
