import { describe, expect, it } from "vitest"
import { roundRunsInParallel, runRoundTurns } from "./roomRound"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe("roundRunsInParallel", () => {
  it("is true only for a roll call", () => {
    expect(roundRunsInParallel("rollcall")).toBe(true)
    expect(roundRunsInParallel(null)).toBe(false)
    expect(roundRunsInParallel(undefined)).toBe(false)
  })
})

describe("runRoundTurns", () => {
  it("parallel: starts every turn before any finishes, so the round takes the slowest turn, not the sum", async () => {
    const started: string[] = []
    const finished: string[] = []
    const t0 = Date.now()
    await runRoundTurns(["teo", "geno", "lex"], true, async (agent) => {
      started.push(agent)
      await sleep(agent === "geno" ? 60 : 20)
      finished.push(agent)
    })
    const elapsed = Date.now() - t0
    expect(started).toEqual(["teo", "geno", "lex"])
    expect(finished[finished.length - 1]).toBe("geno")
    expect(elapsed).toBeLessThan(95) // sequential would be >= 100
  })

  it("parallel: one failing turn does not stop the others", async () => {
    const done: string[] = []
    await runRoundTurns(["a", "b", "c"], true, async (x) => {
      if (x === "b") throw new Error("boom")
      await sleep(5)
      done.push(x)
    })
    expect(done.sort()).toEqual(["a", "c"])
  })

  it("sequential: runs in order and waits for each turn", async () => {
    const log: string[] = []
    await runRoundTurns(["a", "b"], false, async (x) => {
      log.push(`start ${x}`)
      await sleep(5)
      log.push(`end ${x}`)
    })
    expect(log).toEqual(["start a", "end a", "start b", "end b"])
  })

  it("sequential: runs turns appended during the round (handoffs)", async () => {
    const turns = ["geno"]
    const ran: string[] = []
    await runRoundTurns(turns, false, async (x) => {
      ran.push(x)
      if (x === "geno") turns.push("lex")
    })
    expect(ran).toEqual(["geno", "lex"])
  })

  it("sequential: a stop ends the round before the next turn", async () => {
    const controller = new AbortController()
    const ran: string[] = []
    await runRoundTurns(["a", "b", "c"], false, async (x) => {
      ran.push(x)
      if (x === "a") controller.abort()
    }, controller.signal)
    expect(ran).toEqual(["a"])
  })

  it("sequential: a throwing turn does not end the round", async () => {
    const ran: string[] = []
    await runRoundTurns(["a", "b"], false, async (x) => {
      ran.push(x)
      if (x === "a") throw new Error("boom")
    })
    expect(ran).toEqual(["a", "b"])
  })
})
