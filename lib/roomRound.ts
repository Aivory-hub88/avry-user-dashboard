import type { RoundIntent } from "@/lib/agentMentions"

/**
 * Whether a Room round can run all its turns at once.
 *
 * A roll call / introductions round is independent per agent: each one answers
 * for itself only, never @mentions anyone (so no handoff turns), and does not
 * need the replies given earlier in the round. Running it one agent after the
 * other made the last speaker wait for the sum of every earlier turn — whoever
 * the room listed first looked fast, everyone after them slow. Every other
 * round stays sequential: speakers build on earlier replies and may hand off.
 */
export function roundRunsInParallel(intent: RoundIntent | null | undefined): boolean {
  return intent === "rollcall"
}

/**
 * Runs the turns of one round. `run` must not throw (it owns its own error
 * handling); a throw still never blocks the other turns.
 *
 * - parallel: every turn starts now; resolves when all have settled.
 * - sequential: one at a time, in order, re-reading `turns.length` after each
 *   turn so turns appended during the round (handoffs) also run. Stops before
 *   the next turn once `signal` is aborted.
 */
export async function runRoundTurns<T>(
  turns: T[],
  parallel: boolean,
  run: (turn: T, index: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (parallel) {
    await Promise.allSettled(turns.map((turn, i) => run(turn, i)))
    return
  }
  for (let i = 0; i < turns.length; i++) {
    if (signal?.aborted) break
    try {
      await run(turns[i], i)
    } catch {
      // `run` handles its own failures; never let one end the round.
    }
  }
}
