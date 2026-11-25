/**
 * Call governor: one shared gate in front of every agent call the Room makes.
 *
 * Why it exists. An @all round used to start every agent at once (or, before that, five of
 * them with the rest hidden behind identical spinners). Ten simultaneous LLM calls on one
 * key trip rate limits, and one 429 used to surface as "X is unavailable" for whichever
 * agents were unlucky. The governor keeps the room fast without that cliff:
 *
 * - Priority queue, not FIFO. Callers pass a rank (lower = sooner). The agent the user named
 *   or who holds the floor starts before agents that merely belong to the room.
 * - Aging. A waiting call gains one rank per `agingMs`, so a low-priority agent is overtaken
 *   by newer high-priority work only for a bounded time (OpenClaw's lane queue does the same).
 * - Adaptive limit (AIMD). Starts at `initial`; a rate-limit outcome halves it (never below
 *   `min`), a run of clean outcomes adds one back (never above `max`). Slots are handed out
 *   the instant one frees, so whoever is fastest is never held behind a slower agent.
 * - Honest position. `acquire` reports its place in line so the UI can say "waiting for a
 *   slot (#2)" instead of showing a spinner that looks like work.
 *
 * Pure and framework-free: no React, no fetch, no timers except the injectable `now`.
 */

export type CallOutcome = "ok" | "rate_limited" | "error"

export interface GovernorOptions {
  /** Starting number of simultaneous calls. */
  initial?: number
  /** The limit never drops below this (a halving stops here). */
  min?: number
  /** The limit never rises above this. */
  max?: number
  /** Consecutive clean outcomes needed to add one slot back. */
  recoverAfter?: number
  /** A waiter gains one rank of priority per this many ms of waiting. */
  agingMs?: number
  now?: () => number
}

export interface Slot {
  /** Give the slot back, reporting how the call ended so the limit can adapt. */
  release: (outcome: CallOutcome) => void
}

interface Waiter {
  rank: number
  since: number
  seq: number
  resolve: (slot: Slot) => void
  reject: (err: Error) => void
  onPosition?: (position: number) => void
  signal?: AbortSignal
  onAbort?: () => void
}

export class CallGovernor {
  private limit: number
  private active = 0
  private clean = 0
  private seq = 0
  private waiters: Waiter[] = []
  private readonly min: number
  private readonly max: number
  private readonly recoverAfter: number
  private readonly agingMs: number
  private readonly now: () => number

  constructor(opts: GovernorOptions = {}) {
    this.min = Math.max(1, opts.min ?? 2)
    this.max = Math.max(this.min, opts.max ?? 10)
    this.limit = Math.min(this.max, Math.max(this.min, opts.initial ?? 6))
    this.recoverAfter = Math.max(1, opts.recoverAfter ?? 4)
    this.agingMs = Math.max(1, opts.agingMs ?? 15_000)
    this.now = opts.now ?? Date.now
  }

  /** Current simultaneous-call limit (moves with rate-limit feedback). */
  get currentLimit(): number {
    return this.limit
  }

  get inFlight(): number {
    return this.active
  }

  get queued(): number {
    return this.waiters.length
  }

  /**
   * Wait for a slot. `rank` lower = sooner. `onPosition(n)` fires with the caller's 1-based place in
   * line whenever it changes (it is not called when a slot is free right away). Rejects with an
   * AbortError if `signal` aborts while waiting, so a user "stop" never leaves ghost waiters.
   */
  acquire(rank: number, opts: { signal?: AbortSignal; onPosition?: (position: number) => void } = {}): Promise<Slot> {
    const { signal, onPosition } = opts
    if (signal?.aborted) return Promise.reject(abortError())
    return new Promise<Slot>((resolve, reject) => {
      const waiter: Waiter = { rank, since: this.now(), seq: this.seq++, resolve, reject, onPosition, signal }
      if (this.active < this.limit && this.waiters.length === 0) {
        this.active++
        resolve(this.slot())
        return
      }
      if (signal) {
        waiter.onAbort = () => {
          this.waiters = this.waiters.filter((w) => w !== waiter)
          reject(abortError())
          this.notifyPositions()
        }
        signal.addEventListener("abort", waiter.onAbort, { once: true })
      }
      this.waiters.push(waiter)
      this.notifyPositions()
    })
  }

  private slot(): Slot {
    let released = false
    return {
      release: (outcome) => {
        if (released) return
        released = true
        this.active = Math.max(0, this.active - 1)
        this.adapt(outcome)
        this.drain()
      },
    }
  }

  private adapt(outcome: CallOutcome): void {
    if (outcome === "rate_limited") {
      this.clean = 0
      this.limit = Math.max(this.min, Math.floor(this.limit / 2))
    } else if (outcome === "ok") {
      this.clean++
      if (this.clean >= this.recoverAfter && this.limit < this.max) {
        this.limit++
        this.clean = 0
      }
    }
    // A plain error says nothing about capacity: leave the limit and the streak alone.
  }

  /** Effective rank: base rank minus one per `agingMs` waited, ties broken by arrival. */
  private effective(w: Waiter): number {
    return w.rank - Math.floor((this.now() - w.since) / this.agingMs)
  }

  private sorted(): Waiter[] {
    return [...this.waiters].sort((a, b) => this.effective(a) - this.effective(b) || a.seq - b.seq)
  }

  private drain(): void {
    while (this.active < this.limit && this.waiters.length > 0) {
      const next = this.sorted()[0]
      this.waiters = this.waiters.filter((w) => w !== next)
      if (next.signal && next.onAbort) next.signal.removeEventListener("abort", next.onAbort)
      this.active++
      next.resolve(this.slot())
    }
    this.notifyPositions()
  }

  private notifyPositions(): void {
    this.sorted().forEach((w, i) => w.onPosition?.(i + 1))
  }
}

function abortError(): Error {
  const e = new Error("aborted")
  e.name = "AbortError"
  return e
}

/**
 * Whether a failed agent call is worth retrying: the provider/backend said "slow down" or hiccuped,
 * as opposed to the agent refusing or the user stopping. Classified from the message because
 * `sendAgentMessage` surfaces only the backend's detail text.
 */
export function classifyFailure(err: unknown): "rate_limited" | "transient" | "fatal" {
  if (err instanceof Error && err.name === "AbortError") return "fatal"
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase()
  if (/\b429\b|rate.?limit|too many requests|quota|overloaded|capacity/.test(msg)) return "rate_limited"
  if (/\b(502|503|504)\b|bad gateway|unavailable|timed? ?out|timeout|temporar|econnreset|network|failed to fetch/.test(msg)) return "transient"
  return "fatal"
}

/** Backoff before retry `attempt` (1-based): 1.5s, 3s, 6s... with up to +25% jitter, capped at 10s. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(10_000, 1500 * 2 ** (Math.max(1, attempt) - 1))
  return Math.round(base * (1 + 0.25 * random()))
}
