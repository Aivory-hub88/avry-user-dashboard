import { describe, expect, it } from "vitest"
import { isIndependentRound, roundRunsInParallel, runRoundTurns } from "./roomRound"
import type { MentionCandidate } from "./agentMentions"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe("roundRunsInParallel", () => {
  it("is true only for a roll call", () => {
    expect(roundRunsInParallel("rollcall")).toBe(true)
    expect(roundRunsInParallel(null)).toBe(false)
    expect(roundRunsInParallel(undefined)).toBe(false)
  })
})

const mk = (type: string, name: string): MentionCandidate => ({ type, name, title: type, channels: [] })
const room = [mk("finance", "Finn"), mk("ops", "Ofira"), mk("chief_of_staff", "Aira"), mk("sales", "Lex")]
const indep = (text: string, targets = ["finance", "ops"], extra: Partial<Parameters<typeof isIndependentRound>[0]> = {}) =>
  isIndependentRound({ text, targets, candidates: room, ...extra })

describe("roundRunsInParallel with independent flag", () => {
  it("runs in parallel when independent, even without an intent", () => {
    expect(roundRunsInParallel(null, true)).toBe(true)
    expect(roundRunsInParallel(null, false)).toBe(false)
  })
})

describe("isIndependentRound", () => {
  it("positive: a simple question to several @mentioned agents", () => {
    expect(indep("@Finn @Ofira what is our current burn rate?")).toBe(true)
    expect(indep("@Finn, @Ofira dan @Lex berapa target kuartal ini?", ["finance", "ops", "sales"])).toBe(true)
    expect(indep("Hi Finn and Ofira, any risks this week?")).toBe(true)
    expect(indep("@all what is the status of the launch?", ["finance", "ops", "chief_of_staff", "sales"])).toBe(true)
  })
  it("positive: unaddressed message that fell back to the whole room", () => {
    expect(indep("Apa kabar proyek minggu ini?")).toBe(true)
  })
  it("negative: a single agent has nothing to parallelise", () => {
    expect(indep("@Finn what is our burn rate?", ["finance"])).toBe(false)
  })
  it("negative: @mention chain / another agent named in the body", () => {
    expect(indep("@Finn get the numbers and ask @Ofira to check them")).toBe(false)
    expect(indep("@Finn @Ofira check with Lex about the quote", ["finance", "ops"])).toBe(false)
    expect(indep("@Finn tolong cek angka, Ofira yang kirim laporan")).toBe(false)
  })
  it("negative: handoff / delegation / ordering wording", () => {
    expect(indep("@Finn @Ofira please delegate the invoice check to a teammate")).toBe(false)
    expect(indep("@Finn @Ofira first draft the plan, then review it")).toBe(false)
    expect(indep("@Finn @Ofira kerjakan secara berurutan")).toBe(false)
    expect(indep("@Finn @Ofira debate the pricing")).toBe(false)
  })
  it("negative: follow-up referencing a previous reply", () => {
    expect(indep("@Finn @Ofira based on the previous answer, what next?")).toBe(false)
    expect(indep("@Finn @Ofira setuju dengan jawaban tadi?")).toBe(false)
    expect(indep("@Finn @Ofira what do you think of their answers?")).toBe(false)
    expect(indep("@Finn @Ofira and the second one?", undefined, { hasReplyContext: true })).toBe(false)
  })
  it("negative: a pending approval keeps the round sequential", () => {
    expect(indep("@Finn @Ofira ya", undefined, { awaitingApproval: true })).toBe(false)
  })
  it("negative: nothing but the addressees", () => {
    expect(indep("@Finn @Ofira")).toBe(false)
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

  it("parallel: respects the concurrency cap", async () => {
    let running = 0
    let peak = 0
    await runRoundTurns([1, 2, 3, 4, 5, 6], true, async () => {
      peak = Math.max(peak, ++running)
      await sleep(10)
      running--
    }, undefined, 2)
    expect(peak).toBe(2)
  })

  it("parallel: turns appended during the round (handoffs) run after, one at a time", async () => {
    const turns = ["a", "b"]
    const log: string[] = []
    await runRoundTurns(turns, true, async (x) => {
      log.push(`start ${x}`)
      await sleep(x === "a" ? 5 : 15)
      if (x === "a") turns.push("h1", "h2")
      log.push(`end ${x}`)
    })
    expect(log.slice(0, 2)).toEqual(["start a", "start b"])
    expect(log.slice(-4)).toEqual(["start h1", "end h1", "start h2", "end h2"])
  })
})
