import type { MentionCandidate, RoundIntent } from "@/lib/agentMentions"

/**
 * Whether a Room round can run all its turns at once.
 *
 * A roll call / introductions round is independent per agent: each one answers
 * for itself only, never @mentions anyone (so no handoff turns), and does not
 * need the replies given earlier in the round. Running it one agent after the
 * other made the last speaker wait for the sum of every earlier turn — whoever
 * the room listed first looked fast, everyone after them slow.
 *
 * Other rounds are sequential (speakers build on earlier replies and may hand
 * off) UNLESS `isIndependentRound` says the message is one plain question put
 * to several agents. When unsure, sequential.
 */
export function roundRunsInParallel(
  intent: RoundIntent | null | undefined,
  independent = false,
): boolean {
  return intent === "rollcall" || independent
}

/** Upper bound on simultaneous agent turns in an independent (non roll-call) round. */
export const MAX_PARALLEL_TURNS = 5

// Leading politeness before the addressees: "Hi Finn and Ofira, ..."
const GREETING = /^\s*(?:hi|hai|halo|hello|hey|dear|kak|pak|bu|mas|mbak)\b[\s,]*/i
// Between addressees: "@Finn, @Ofira & Teo dan Lex: ..."
const ADDRESS_SEP = /^(?:\s|,|&|\+|:|-|—|(?:and|dan|sama|serta|with)(?![A-Za-z0-9_]))+/i
const GROUP_TOKENS = ["all", "everyone", "team", "semua", "kalian"]

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * The message with its leading addressee block ("@Finn @Ofira", "Finn, Ofira:",
 * "@all") removed. Anything left that still names an agent is NOT a plain
 * addressing — it is an instruction involving a second agent.
 */
function stripLeadingAddressees(text: string, candidates: MentionCandidate[]): string {
  const aliases = [
    ...GROUP_TOKENS,
    ...candidates.flatMap((c) => [c.name, c.type, c.type.replace(/_/g, "")]),
  ].filter(Boolean)
  const alias = new RegExp(`^@?(?:${aliases.map(escapeRe).join("|")})(?![A-Za-z0-9_])`, "i")
  let rest = text.replace(GREETING, "")
  for (let guard = 0; guard < 50; guard++) {
    const trimmed = rest.replace(ADDRESS_SEP, "")
    const m = alias.exec(trimmed)
    if (!m) {
      rest = trimmed
      break
    }
    rest = trimmed.slice(m[0].length)
  }
  return rest
}

/**
 * Wording that makes a turn depend on another agent's answer, or asks for an
 * order/handoff/discussion. Indonesian + English, matching the rest of the room.
 */
const DEPENDENT_WORDING = new RegExp(
  [
    // refers to what was already said
    "previous|earlier|above|prior|sebelumnya|sebelum itu|tadi|barusan|di atas|diatas",
    "what\\s+(?:he|she|they|\\w+)\\s+(?:said|wrote|replied|answered)|apa\\s+(?:kata|yang\\s+(?:dia|ia|mereka))",
    "(?:their|his|her|other|another|each\\s+other(?:'s)?)\\s+(?:answers?|repl(?:y|ies)|responses?|opinions?|views?)",
    "(?:jawaban|balasan|tanggapan|pendapat|komentar)\\s+(?:dia|mereka|yang\\s+lain|teman|rekan)",
    "(?:the\\s+)?(?:answers?|repl(?:y|ies)|responses?)\\s+(?:above|before)",
    // builds on / reacts to others
    "build\\s+on|based\\s+on|respond\\s+to|react\\s+to|comment\\s+on|agree|disagree|setuju|tanggapi|berdasarkan|bandingkan|compare|combine|merge|gabungkan|rangkum|summari[sz]e\\s+(?:their|all|the\\s+answers)",
    // explicit ordering / turn-taking
    "then|lalu|kemudian|setelah\\s+(?:itu|dia)|after\\s+(?:that|he|she|they)|first\\b.*\\bnext|bergantian|berurutan|secara\\s+berurutan|in\\s+turn|one\\s+after|sequential|continue|lanjut|follow[\\s-]?up",
    // conversation among agents, handoff, delegation
    "debate|discuss|diskusi|brainstorm|collaborat|kolaborasi|coordinat|koordinasi|together|bersama|bareng|hand\\s*off|hand\\s+over|delegate|delegasi|teammates?|rekan|colleague|\\bask\\b|\\btanya(?:kan)?\\b|\\bminta\\b|\\bsuruh\\b|tell\\s+(?:him|her|them)|kasih\\s+tahu",
  ].join("|"),
  "i",
)

export interface IndependentRoundInput {
  /** Raw user message, @mentions intact. */
  text: string
  /** Agent types answering this round. */
  targets: string[]
  /** Deployed room members (for recognising names in the message body). */
  candidates: MentionCandidate[]
  /** The user quoted an earlier message (reply-to). */
  hasReplyContext?: boolean
  /** Some target is waiting on a Yes/No approval, which has its own protocol. */
  awaitingApproval?: boolean
}

/**
 * Conservative: true only for one plain message put to two or more agents,
 * where no turn can need another turn's reply. Every doubt returns false and
 * the round stays sequential.
 *
 * Sequential (false) when:
 * - fewer than two agents answer;
 * - the user quotes a previous message, or an agent awaits an approval answer;
 * - the message names an agent anywhere after the leading addressees
 *   ("@Finn ask @Ofira ...", "Finn, check with Ofira ...") or has any other @mention;
 * - the wording refers to prior/other answers, asks for ordering, discussion,
 *   delegation or a handoff.
 */
export function isIndependentRound(input: IndependentRoundInput): boolean {
  const { text, targets, candidates, hasReplyContext = false, awaitingApproval = false } = input
  if (new Set(targets).size < 2) return false
  if (hasReplyContext || awaitingApproval) return false
  const body = stripLeadingAddressees(text, candidates).trim()
  if (!body) return false
  if (/@[A-Za-z0-9_]+/.test(body)) return false
  const names = candidates.flatMap((c) => [c.name, c.type, c.type.replace(/_/g, "")]).filter(Boolean)
  const named = new RegExp(`(?:^|[^A-Za-z0-9_])(?:${names.map(escapeRe).join("|")})(?![A-Za-z0-9_])`, "i")
  if (names.length > 0 && named.test(body)) return false
  if (DEPENDENT_WORDING.test(body)) return false
  return true
}

/**
 * Runs the turns of one round. `run` must not throw (it owns its own error
 * handling); a throw still never blocks the other turns.
 *
 * - parallel: the initial turns start together (at most `concurrency` at a
 *   time, default all) and the call waits for all of them. Turns appended
 *   meanwhile (handoffs) then run one after another, in order, because they
 *   depend on the reply that produced them.
 * - sequential: one at a time, in order, re-reading `turns.length` after each
 *   turn so turns appended during the round (handoffs) also run. Stops before
 *   the next turn once `signal` is aborted.
 */
export async function runRoundTurns<T>(
  turns: T[],
  parallel: boolean,
  run: (turn: T, index: number) => Promise<void>,
  signal?: AbortSignal,
  concurrency = Infinity,
): Promise<void> {
  let next = 0
  if (parallel) {
    const initial = turns.length
    const limit = Math.max(1, Math.min(concurrency, initial))
    const worker = async () => {
      while (next < initial) {
        const i = next++
        try {
          await run(turns[i], i)
        } catch {
          // `run` handles its own failures; never let one end the round.
        }
      }
    }
    await Promise.all(Array.from({ length: limit }, worker))
  }
  for (let i = next; i < turns.length; i++) {
    if (signal?.aborted) break
    try {
      await run(turns[i], i)
    } catch {
      // `run` handles its own failures; never let one end the round.
    }
  }
}
