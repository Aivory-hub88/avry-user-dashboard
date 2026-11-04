import { describe, it, expect } from 'vitest'
import { createSmoothStream, createChunkAccumulator } from './smoothStream'

/** Manual frame clock: each tick() runs the pending frame callback, 16 ms later. */
function manualClock() {
  let cb: ((now: number) => void) | null = null
  let now = 1000
  return {
    schedule(fn: (now: number) => void) {
      cb = fn
      return () => {
        if (cb === fn) cb = null
      }
    },
    tick(ms = 16): boolean {
      if (!cb) return false
      const fn = cb
      cb = null
      now += ms
      fn(now)
      return true
    },
    get pending() {
      return cb !== null
    },
  }
}

function setup(opts: { minCps?: number; catchUpMs?: number } = {}) {
  const clock = manualClock()
  const frames: string[] = []
  const stream = createSmoothStream({ onUpdate: (s) => frames.push(s), schedule: clock.schedule, ...opts })
  return { clock, frames, stream }
}

describe('createSmoothStream', () => {
  it('reveals text over several frames, never out of order, and ends on the full text', () => {
    const { clock, frames, stream } = setup()
    stream.push('Hello, this is a reasonably long streamed answer.')
    while (clock.tick()) {
      /* run to the end */
    }
    expect(frames.length).toBeGreaterThan(3)
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].startsWith(frames[i - 1])).toBe(true)
      expect(frames[i].length).toBeGreaterThan(frames[i - 1].length)
    }
    expect(frames[frames.length - 1]).toBe('Hello, this is a reasonably long streamed answer.')
  })

  it('paints at most once per frame, however many pushes arrive in between', () => {
    const { clock, frames, stream } = setup()
    stream.push('a'.repeat(10))
    stream.push('a'.repeat(20))
    stream.push('a'.repeat(30))
    expect(frames).toHaveLength(0)
    clock.tick()
    expect(frames).toHaveLength(1)
  })

  it('works a big backlog off faster than the steady pace', () => {
    const slow = setup({ minCps: 120 })
    slow.stream.push('x'.repeat(40))
    let slowFrames = 0
    while (slow.clock.tick()) slowFrames++

    const big = setup({ minCps: 120 })
    big.stream.push('x'.repeat(2000))
    let bigFrames = 0
    while (big.clock.tick()) bigFrames++

    // 50x the text must not take anywhere near 50x the frames.
    expect(bigFrames).toBeLessThan(slowFrames * 12)
    expect(big.frames[big.frames.length - 1]).toHaveLength(2000)
  })

  it('keeps a steady floor so a tiny backlog still moves every frame', () => {
    const { clock, frames, stream } = setup({ minCps: 120 })
    stream.push('abcdef')
    clock.tick()
    expect(frames[0].length).toBeGreaterThanOrEqual(1)
  })

  it('flush shows everything now and stops scheduling', () => {
    const { clock, frames, stream } = setup()
    stream.push('some text that has not been revealed yet')
    stream.flush()
    expect(frames[frames.length - 1]).toBe('some text that has not been revealed yet')
    expect(clock.pending).toBe(false)
  })

  it('cancel drops the pending frame and ignores later pushes', () => {
    const { clock, frames, stream } = setup()
    stream.push('hello world')
    stream.cancel()
    expect(clock.pending).toBe(false)
    stream.push('hello world again')
    expect(clock.tick()).toBe(false)
    expect(frames).toHaveLength(0)
  })

  it('does not split a surrogate pair', () => {
    const { clock, frames, stream } = setup({ minCps: 60 })
    const text = 'a😀😀😀😀😀😀😀😀'
    stream.push(text)
    while (clock.tick()) {
      /* run */
    }
    for (const f of frames) {
      const last = f.charCodeAt(f.length - 1)
      expect(last >= 0xd800 && last <= 0xdbff).toBe(false)
    }
    expect(frames[frames.length - 1]).toBe(text)
  })

  it('handles a rewrite of already-shown text by keeping only the common prefix', () => {
    const { clock, frames, stream } = setup()
    stream.push('The quick brown fox')
    while (clock.tick()) {
      /* show it all */
    }
    stream.push('The quick red fox jumps')
    while (clock.tick()) {
      /* run */
    }
    expect(frames[frames.length - 1]).toBe('The quick red fox jumps')
  })

  it('a throttled tab (one very long frame) does not lurch forward by seconds of text', () => {
    const { clock, frames, stream } = setup({ minCps: 120, catchUpMs: 1e9 })
    stream.push('x'.repeat(5000))
    clock.tick(16)
    clock.tick(5000) // tab was asleep
    // With the catch-up term off, a 5 s frame is capped at 64 ms of the steady pace (~8 chars).
    expect(frames[1].length - frames[0].length).toBeLessThanOrEqual(10)
  })
})

describe('createChunkAccumulator', () => {
  it('appends delta chunks', () => {
    const acc = createChunkAccumulator()
    expect(acc.add('Hel')).toBe('Hel')
    expect(acc.add('lo ')).toBe('Hello ')
    expect(acc.add('world')).toBe('Hello world')
  })

  it('replaces on cumulative chunks', () => {
    const acc = createChunkAccumulator()
    expect(acc.add('Hel')).toBe('Hel')
    expect(acc.add('Hello')).toBe('Hello')
    expect(acc.add('Hello world')).toBe('Hello world')
  })

  it('keeps the detected convention for the rest of the stream', () => {
    const acc = createChunkAccumulator()
    acc.add('ab')
    acc.add('cd') // delta
    // A later delta that happens to start with the whole text so far must still be appended.
    expect(acc.add('abcd')).toBe('abcdabcd')
  })

  it('a single whole-reply chunk is just that reply', () => {
    const acc = createChunkAccumulator()
    expect(acc.add('The whole answer.')).toBe('The whole answer.')
  })
})
