import { describe, it, expect } from "vitest"
import { createSpeechMeter, rmsOf } from "@/lib/voiceActivity"

describe("voiceActivity", () => {
  it("rmsOf is 0 for silence and empty input", () => {
    expect(rmsOf([])).toBe(0)
    expect(rmsOf(new Float32Array(128))).toBe(0)
  })

  it("rmsOf measures level", () => {
    expect(rmsOf([0.5, -0.5, 0.5, -0.5])).toBeCloseTo(0.5)
  })

  it("room hum is not speech", () => {
    const m = createSpeechMeter()
    for (let i = 0; i < 200; i++) m.push(0.004)
    expect(m.heardSpeech()).toBe(false)
  })

  it("a single click is not speech", () => {
    const m = createSpeechMeter()
    m.push(0.3)
    for (let i = 0; i < 50; i++) m.push(0.001)
    expect(m.heardSpeech()).toBe(false)
  })

  it("enough loud frames, even non-consecutive, count as speech", () => {
    const m = createSpeechMeter()
    for (const rms of [0.05, 0.002, 0.04, 0.002, 0.06, 0.03]) m.push(rms)
    expect(m.heardSpeech()).toBe(true)
  })
})
