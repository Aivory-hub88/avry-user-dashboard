/**
 * Smooth text streaming for chat bubbles.
 *
 * Network chunks arrive in bursts (a few tokens, a pause, a big batch). Painting each chunk
 * as it lands makes the text stutter and re-parses the whole markdown message far more often
 * than a screen can show. This module separates the two rates, the way chat UIs like Claude's do:
 *
 *  - the network side calls push(fullTextSoFar) whenever it likes;
 *  - the screen side reveals that text at most once per animation frame, at a steady pace that
 *    speeds up when the backlog grows (so the display never falls far behind the model) and
 *    never goes below a calm reading floor.
 *
 * The final text is always shown in full: callers cancel() and then paint the finished message
 * themselves, or flush() to jump to the end.
 */

export interface SmoothStream {
  /** Latest full text received so far (cumulative, not a delta). */
  push(fullText: string): void
  /** Show everything received so far, immediately. */
  flush(): void
  /** Stop without painting anything else (a pending frame is dropped). */
  cancel(): void
}

export interface SmoothStreamOptions {
  onUpdate: (shown: string) => void
  /** Frame scheduler; returns a canceller. Defaults to requestAnimationFrame (16 ms timer elsewhere). */
  schedule?: (cb: (now: number) => void) => () => void
  /** Slowest reveal speed in characters per second. */
  minCps?: number
  /** Time constant in ms for working off a backlog: smaller catches up faster. */
  catchUpMs?: number
}

const DEFAULT_MIN_CPS = 120
const DEFAULT_CATCH_UP_MS = 120
// A frame that took longer than this (tab throttled, long GC) is treated as this long, so the
// reveal never lurches forward by seconds of text in one step.
const MAX_FRAME_MS = 64

function defaultSchedule(cb: (now: number) => void): () => void {
  if (typeof requestAnimationFrame === 'function') {
    const id = requestAnimationFrame(cb)
    return () => cancelAnimationFrame(id)
  }
  const id = setTimeout(() => cb(Date.now()), 16)
  return () => clearTimeout(id)
}

function commonPrefixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++
  return i
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff
}

export function createSmoothStream(opts: SmoothStreamOptions): SmoothStream {
  const schedule = opts.schedule ?? defaultSchedule
  const minCps = opts.minCps ?? DEFAULT_MIN_CPS
  const catchUpMs = opts.catchUpMs ?? DEFAULT_CATCH_UP_MS

  let target = ''
  let shown = 0
  let last: number | null = null
  let cancelFrame: (() => void) | null = null
  let stopped = false

  const frame = (now: number) => {
    cancelFrame = null
    if (stopped) return
    const dt = last === null ? 16 : Math.min(Math.max(now - last, 0), MAX_FRAME_MS)
    last = now
    const backlog = target.length - shown
    if (backlog <= 0) {
      last = null
      return
    }
    const steady = (minCps * dt) / 1000
    const catchUp = backlog * (1 - Math.exp(-dt / catchUpMs))
    let next = Math.min(target.length, shown + Math.max(1, Math.round(Math.max(steady, catchUp))))
    // Never cut a surrogate pair (emoji, some CJK) in half.
    if (next < target.length && isHighSurrogate(target.charCodeAt(next - 1))) next++
    shown = next
    opts.onUpdate(target.slice(0, shown))
    if (shown < target.length) cancelFrame = schedule(frame)
    else last = null
  }

  return {
    push(fullText: string) {
      if (stopped) return
      // The text was rewritten (not just extended): keep only what is still valid.
      if (fullText.length < shown || !fullText.startsWith(target.slice(0, shown))) {
        shown = Math.min(shown, commonPrefixLength(fullText, target))
      }
      target = fullText
      if (!cancelFrame && shown < target.length) cancelFrame = schedule(frame)
    },
    flush() {
      if (stopped) return
      cancelFrame?.()
      cancelFrame = null
      last = null
      if (shown !== target.length) {
        shown = target.length
        opts.onUpdate(target)
      }
    },
    cancel() {
      stopped = true
      cancelFrame?.()
      cancelFrame = null
    },
  }
}

/**
 * Turns a stream of `chunk` frames into the full text so far, whichever convention the server
 * uses. Deltas ("Hel", "lo") and cumulative frames ("Hel", "Hello") both occur on the console
 * paths, so the convention is detected once, from the second frame, and then kept for the
 * rest of the stream: a second frame that is longer than and starts with the first means
 * cumulative; anything else means delta.
 */
export function createChunkAccumulator(): { add(content: string): string; readonly text: string } {
  let text = ''
  let count = 0
  let mode: 'delta' | 'cumulative' | null = null
  return {
    add(content: string): string {
      if (count++ === 0) {
        text = content
        return text
      }
      if (mode === null) {
        mode = content.length > text.length && content.startsWith(text) ? 'cumulative' : 'delta'
      }
      text = mode === 'cumulative' ? content : text + content
      return text
    },
    get text() {
      return text
    },
  }
}
