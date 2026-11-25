"use client"

import { useEffect, useRef } from "react"
import { createLevelNormalizer } from "@/lib/voiceActivity"

const BAR_COUNT = 9
const MIN_PX = 3
const MAX_PX = 18
/** ~one syllable apart, so neighbouring bars carry different parts of speech. */
const SAMPLE_INTERVAL_MS = 80

/** `level` is already normalised to the user's mic; the exponent keeps quiet speech visible. */
const barHeight = (level: number) => MIN_PX + Math.pow(level, 0.75) * (MAX_PX - MIN_PX)

/**
 * Live input waveform: bars scroll right-to-left with the real mic level.
 * Heights are written straight to the DOM from a rAF loop, so recording never
 * costs a React render. Silence rests at minimum height — no fake motion.
 */
export default function MicWaveform({ getLevel }: { getLevel: () => number }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    const levels = new Array<number>(BAR_COUNT).fill(0)
    const normalize = createLevelNormalizer()
    let frame = 0
    let last = 0
    const paint = (now: number) => {
      if (now - last >= SAMPLE_INTERVAL_MS) {
        last = now
        levels.shift()
        levels.push(normalize(getLevel()))
        for (let i = 0; i < BAR_COUNT; i++) {
          const el = bars.current[i]
          if (el) el.style.height = `${barHeight(levels[i])}px`
        }
      }
      frame = requestAnimationFrame(paint)
    }
    frame = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(frame)
  }, [getLevel])

  return (
    <span aria-hidden="true" className="flex h-5 items-center gap-[3px]">
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            bars.current[i] = el
          }}
          className="w-[2px] rounded-full bg-current transition-[height] duration-75 ease-out motion-reduce:transition-none"
          style={{ height: MIN_PX }}
        />
      ))}
    </span>
  )
}
