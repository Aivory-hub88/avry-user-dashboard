import { describe, expect, it } from "vitest"
import { cosine, embeddingsConfigured } from "./embeddings"

describe("cosine", () => {
  it("scores identical vectors 1 and orthogonals 0", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0)
    expect(cosine([1, 1], [1, 1])).toBeCloseTo(1)
  })

  it("returns 0 for incomparable input", () => {
    expect(cosine([], [])).toBe(0)
    expect(cosine([1, 2], [1])).toBe(0)
    expect(cosine([0, 0], [1, 1])).toBe(0)
  })
})

describe("embeddingsConfigured", () => {
  it("is false without a key (graceful degradation)", () => {
    expect(embeddingsConfigured()).toBe(false)
  })
})
