/**
 * Agent-to-agent handoff (ADR-020): an agent's reply may hand work to a
 * teammate by writing `@Name`. The teammate then answers in its OWN message.
 *
 * Shared by the Console Room (client, turn queue) and the Workspace (server,
 * chained tasks), so the safety rules live in exactly one place:
 *   - only a deliberate `@Name` counts (never a bare name: agents say names all
 *     the time), and `@all` / `@here` never fan out from an agent;
 *   - only teammates that are actually in the room/space, never yourself;
 *   - a chain is bounded: depth, total turns, turns per agent;
 *   - an agent with a turn already queued is not queued twice.
 *
 * CLIENT-SAFE: no imports. Keep it that way (it is bundled on both sides).
 */

/** Hops after the human's message (human -> A is depth 0, A -> B is depth 1, B -> C is depth 2). */
export const HANDOFF_MAX_DEPTH = 2
/** All turns in one chain, the human-triggered ones included. */
export const HANDOFF_MAX_TURNS = 8
/** One agent can speak at most this many times in one chain (stops A <-> B ping-pong). */
export const HANDOFF_MAX_PER_AGENT = 2

export interface HandoffCandidate {
  type: string
  name: string
}

const BROADCAST = new Set(["all", "everyone", "everybody", "here", "channel", "semua", "team"])

// `@Name` not preceded by a word char or another @ (so emails and `a@b` never match).
const AT_TOKEN = /(?<![\w@])@([A-Za-z0-9][A-Za-z0-9_-]*)/g

/** Blank out code (fenced and inline): `@Lex` inside code is an example, not a call. */
function maskCode(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (m) => " ".repeat(m.length))
    .replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length))
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[_-]/g, "")
}

function resolve(token: string, candidates: HandoffCandidate[]): string | null {
  const t = norm(token)
  for (const c of candidates) {
    if (t === norm(c.name) || t === norm(c.type)) return c.type
  }
  return null
}

/**
 * Teammates called with `@Name` in `text`, in order of first appearance, de-duplicated.
 * `self` is excluded; broadcast tokens and unknown names are ignored.
 */
export function extractAgentMentions(
  text: string,
  candidates: HandoffCandidate[],
  self?: string,
): string[] {
  if (typeof text !== "string" || !text) return []
  const masked = maskCode(text)
  const out: string[] = []
  AT_TOKEN.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = AT_TOKEN.exec(masked)) !== null) {
    if (BROADCAST.has(m[1].toLowerCase())) continue
    const type = resolve(m[1], candidates)
    if (!type || type === self || out.includes(type)) continue
    out.push(type)
  }
  return out
}

export interface HandoffState {
  /** Depth of the turn whose reply is being examined (0 = answered the human directly). */
  depth: number
  /** Turns already used in this chain, per agent (the current turn included). */
  usedPerAgent: Record<string, number>
  /** Turns already used in this chain overall (the current turn included). */
  usedTotal: number
  /** Agents that already have a turn waiting to run in this chain. */
  queued?: Iterable<string>
}

/**
 * Which of the mentioned teammates may actually take a turn now. Pure: the caller
 * owns the counters (client array / database rows).
 */
export function planHandoffs(
  reply: string,
  candidates: HandoffCandidate[],
  self: string,
  state: HandoffState,
): string[] {
  if (state.depth + 1 > HANDOFF_MAX_DEPTH) return []
  const queued = new Set(state.queued ?? [])
  const out: string[] = []
  let total = state.usedTotal
  for (const type of extractAgentMentions(reply, candidates, self)) {
    if (total >= HANDOFF_MAX_TURNS) break
    if (queued.has(type)) continue
    if ((state.usedPerAgent[type] ?? 0) >= HANDOFF_MAX_PER_AGENT) continue
    out.push(type)
    total += 1
  }
  return out
}

/**
 * Turn plain `@Name` into the Workspace's link token `[@Name](#agent:type)` for the
 * teammates in `candidates`, so the message renders a mention chip and carries the
 * agent stamp. Tokens already in link form, code, and unknown names are left alone.
 */
export function linkAgentMentions(text: string, candidates: HandoffCandidate[]): string {
  if (typeof text !== "string" || !text) return text
  const masked = maskCode(text)
  // Skip anything already inside a markdown link label: [@Name](...)
  const protectedSpans: [number, number][] = []
  const linkRe = /\[[^\[\]]*\]\([^)]*\)/g
  let lm: RegExpExecArray | null
  while ((lm = linkRe.exec(masked)) !== null) protectedSpans.push([lm.index, lm.index + lm[0].length])
  const inLink = (i: number) => protectedSpans.some(([a, b]) => i >= a && i < b)

  let out = ""
  let last = 0
  AT_TOKEN.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = AT_TOKEN.exec(masked)) !== null) {
    if (inLink(m.index) || BROADCAST.has(m[1].toLowerCase())) continue
    const type = resolve(m[1], candidates)
    if (!type) continue
    const label = text.slice(m.index, m.index + 1 + m[1].length)
    out += text.slice(last, m.index) + `[${label}](#agent:${type})`
    last = m.index + 1 + m[1].length
  }
  return out + text.slice(last)
}
