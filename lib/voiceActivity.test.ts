import { describe, it, expect } from "vitest"
import { createLevelNormalizer, createSpeechMeter, rmsOf } from "@/lib/voiceActivity"

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
    for (let i = 0; i < 200; i++) m.push(0.002)
    expect(m.heardSpeech()).toBe(false)
  })

  it("a single click is not speech", () => {
    const m = createSpeechMeter()
    m.push(0.3)
    for (let i = 0; i < 50; i++) m.push(0.0005)
    expect(m.heardSpeech()).toBe(false)
  })

  it("enough loud frames, even non-consecutive, count as speech", () => {
    const m = createSpeechMeter()
    for (const rms of [0.05, 0.002, 0.04, 0.002, 0.06]) m.push(rms)
    expect(m.heardSpeech()).toBe(true)
  })

  it("speech on a quiet mic still counts", () => {
    const m = createSpeechMeter()
    for (const rms of [0.0004, 0.0004, 0.003, 0.0035, 0.003, 0.0004, 0.0004, 0.0004]) m.push(rms)
    expect(m.heardSpeech()).toBe(true)
  })

  it("steady noise on a noisy mic is not speech", () => {
    const m = createSpeechMeter()
    for (let i = 0; i < 100; i++) m.push(0.012 + (i % 3) * 0.001)
    expect(m.heardSpeech()).toBe(false)
  })

  it("a clip that is loud throughout is sent, not vetoed", () => {
    const m = createSpeechMeter()
    for (let i = 0; i < 100; i++) m.push(0.05)
    expect(m.heardSpeech()).toBe(true)
  })
})

describe("createLevelNormalizer", () => {
  it("rests at 0 on constant background", () => {
    const n = createLevelNormalizer()
    let out = 1
    for (let i = 0; i < 50; i++) out = n(0.01)
    expect(out).toBe(0)
  })

  it("fills the lane for speech on both quiet and hot mics", () => {
    for (const scale of [0.1, 1]) {
      const n = createLevelNormalizer()
      for (let i = 0; i < 20; i++) n(0.002 * scale)
      expect(n(0.08 * scale)).toBeGreaterThan(0.8)
    }
  })
})
