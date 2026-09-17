/**
 * @mention support for the Console "Room" mode (Mission Control chat room).
 *
 * Room lets the user address several deployed agents in one composer, e.g.
 * `@Teo check the queue` or `@all daily status`. This module is the pure,
 * UI-free core: who can be mentioned (deployed agents only) and how raw
 * input text maps to agent types.
 *
 * Deployments come from lib/agentChat.listDeployments() (Telegram bindings,
 * Slack installations, API keys). Only agent types with >= 1 deployment are
 * mentionable — an undeployed agent has nowhere to run, so offering it in
 * the menu would be a dead end.
 */

import { PREBUILT_AGENTS, type AgentDeployment } from "@/lib/agentChat"

export interface MentionCandidate {
  type: string
  name: string
  title: string
  /** Channel kinds this agent is deployed to (telegram/slack/api). */
  channels: string[]
}

/**
 * Unique deployed agent types, first-seen order, joined with the roster for
 * display names. Roster-less types (stale bindings) are dropped — there is
 * no name/avatar to render for them.
 */
export function getMentionCandidates(deployments: AgentDeployment[]): MentionCandidate[] {
  const seen = new Map<string, string[]>()
  for (const d of deployments) {
    if (!seen.has(d.agentType)) seen.set(d.agentType, [])
    seen.get(d.agentType)!.push(d.kind)
  }
  const out: MentionCandidate[] = []
  for (const [type, kinds] of seen) {
    const roster = PREBUILT_AGENTS.find((a) => a.type === type)
    if (!roster) continue
    out.push({
      type,
      name: roster.name,
      title: roster.title,
      channels: [...new Set(kinds)],
    })
  }
  return out
}

const MENTION_TOKEN = /@([A-Za-z0-9_]+)/g

function tokenToType(token: string, candidates: MentionCandidate[]): string | null {
  const t = token.toLowerCase()
  if (t === "all" || t === "everyone" || t === "team") return "__all__"
  const hit = candidates.find(
    (c) =>
      c.name.toLowerCase() === t ||
      c.type.toLowerCase() === t ||
      c.type.toLowerCase().replace(/_/g, "") === t,
  )
  return hit ? hit.type : null
}

/**
 * Agent types mentioned in `text`, in order of first appearance, deduplicated.
 * `@all`/`@everyone`/`@team` expands to every candidate. Unknown @tokens are
 * ignored (plain emails etc. must not route anywhere).
 */
export function parseAgentMentions(text: string, candidates: MentionCandidate[]): string[] {
  const out: string[] = []
  const push = (type: string) => {
    if (type === "__all__") {
      for (const c of candidates) push(c.type)
      return
    }
    if (!out.includes(type)) out.push(type)
  }
  MENTION_TOKEN.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MENTION_TOKEN.exec(text)) !== null) {
    const type = tokenToType(m[1], candidates)
    if (type) push(type)
  }
  return out
}

function escapeMentionRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Name-based addressing ("panggilkan Lex", "tanya ke Teo", "ask Finn") —
 * mention semantics without the @ sign. Whole-word match (case-insensitive)
 * on display name, agent type id, and the id without underscores, in order
 * of first appearance, deduplicated. Only deployed candidates are ever
 * passed in, so every hit is directly callable — same guarantee as @.
 */
export function resolveNamedAgents(text: string, candidates: MentionCandidate[]): string[] {
  const hits: Array<{ type: string; index: number }> = []
  for (const c of candidates) {
    const aliases = [c.name, c.type, c.type.replace(/_/g, "")]
    for (const a of aliases) {
      if (!a) continue
      const re = new RegExp(`(^|[^A-Za-z0-9_])${escapeMentionRegExp(a)}([^A-Za-z0-9_]|$)`, "i")
      const m = re.exec(text)
      if (m) {
        hits.push({ type: c.type, index: m.index })
        break
      }
    }
  }
  hits.sort((x, y) => x.index - y.index)
  const out: string[] = []
  for (const h of hits) {
    if (!out.includes(h.type)) out.push(h.type)
  }
  return out
}

/**
 * Removes only the @tokens that resolved to a candidate (or @all), leaving
 * the rest of the text — including unknown @tokens — untouched.
 */
export function stripAgentMentions(text: string, candidates: MentionCandidate[]): string {
  MENTION_TOKEN.lastIndex = 0
  return text
    .replace(MENTION_TOKEN, (full, token: string) =>
      tokenToType(token, candidates) ? "" : full,
    )
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

export function agentNameOf(type: string): string {
  return PREBUILT_AGENTS.find((a) => a.type === type)?.name ?? type
}

/** Roster-only candidate (no deployment info) — for addressing replies. */
export function candidateOf(type: string): MentionCandidate | null {
  const r = PREBUILT_AGENTS.find((a) => a.type === type)
  return r ? { type, name: r.name, title: r.title, channels: [] } : null
}

// ── Room continuity ─────────────────────────────────────────────────────
// A bare follow-up (no @mention) must continue with whoever is active in
// this thread — not fall back to the console brain. The open thread just
// asked Lex three questions; answering them without "@Lex" must still reach
// Lex. So: take the agent types off the latest assistant round (assistant
// bubbles since the last user message), oldest-first for speaking order.
// Empty thread, console-only history, or in-flight placeholders yield []
// and the caller keeps the direct-console fallback.

// ── Room group-chat context (LobeHub RFC-130 style) ─────────────────────────
// LobeHub's group chat works because every agent receives the same three
// things, not just the raw user text: (1) who is in the room and who they
// are, (2) the shared transcript with an author tag on each message, and
// (3) sequential order — each agent's prompt includes the replies already
// given this round, so members can build on (not duplicate or miss) each
// other. Parallel fan-out without this is why "Teo" answered a "@Geno help
// @Teo" message like a fresh 1:1 greeting: it never saw it was a group
// message, who else was addressed, or what Geno said.
//
// Our backend (POST /api/v1/telegram/agent-chat) is stateless per call
// except an opaque conversation_id, so the dashboard injects this block
// into `text` — no backend change needed.

export interface RoomHistoryEntry {
  author: string
  text: string
}

export interface ThreadMessage {
  role: "user" | "assistant"
  agentType?: string | null
  isStreaming?: boolean
}

/**
 * Agent types holding the floor in this thread's latest round. Walks back
 * from the newest message while it keeps seeing finished assistant bubbles;
 * stops at the first user message (previous round) or streaming placeholder.
 */
export function inferRoomFallback(messages: ThreadMessage[]): string[] {
  const reversed: string[] = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== "assistant" || m.isStreaming) break
    if (m.agentType && !reversed.includes(m.agentType)) reversed.push(m.agentType)
  }
  return reversed.reverse()
}

// ── Room sticky participants ────────────────────────────────────────────
// The toggle is global while threads come and go: a user mid-conversation
// with Lex who hits New chat (or reloads into a fresh thread) and types a
// bare follow-up still means Lex, not the console. So every room send
// records its targets; a bare message with no thread history falls back to
// the sticky set while fresh. Recency-bounded (30 min) so a new day starts
// clean instead of resurrecting yesterday's room.
const ROOM_STICKY_KEY = "aivory:room:lastAgents"
export const ROOM_STICKY_MAX_AGE_MS = 30 * 60_000

function readSticky(): { agents: string[]; ts: number } | null {
  try {
    if (typeof localStorage === "undefined") return null
    const raw = localStorage.getItem(ROOM_STICKY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { agents?: unknown; ts?: unknown }
    if (!Array.isArray(parsed.agents) || typeof parsed.ts !== "number") return null
    const agents = parsed.agents.filter((a): a is string => typeof a === "string")
    return { agents, ts: parsed.ts }
  } catch {
    return null
  }
}

export function saveRoomSticky(agentTypes: string[]): void {
  try {
    if (typeof localStorage === "undefined") return
    const agents = [...new Set(agentTypes)].filter(Boolean)
    if (agents.length === 0) return
    localStorage.setItem(ROOM_STICKY_KEY, JSON.stringify({ agents, ts: Date.now() }))
  } catch {
    // Storage full/blocked — stickiness is a nicety, never load-bearing.
  }
}

/** Sticky room participants, fresh only. Empty when none or expired. */
export function loadRoomSticky(now = Date.now()): string[] {
  const stored = readSticky()
  if (!stored) return []
  if (now - stored.ts > ROOM_STICKY_MAX_AGE_MS) return []
  return stored.agents
}

/** Explicit escape hatch back to the console brain inside a sticky room. */
export function isConsoleMention(text: string): boolean {
  return /(^|\s)@(aivory|console)\b/i.test(text)
}

export interface RoomPayloadParams {
  /** Agent this payload is built for. */
  me: MentionCandidate
  /** Other agents answering in the same round. */
  peers: MentionCandidate[]
  /** Raw user message, @mentions intact (they signal who is asked what). */
  userText: string
  /** Room transcript before this turn, oldest-first. */
  history: RoomHistoryEntry[]
  /** Replies already given this round, in speaking order. */
  roundReplies: RoomHistoryEntry[]
}

const MAX_HISTORY_ENTRIES = 6
const MAX_HISTORY_CHARS = 500
const MAX_REPLY_CHARS = 1200

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

export function buildRoomPayload({ me, peers, userText, history, roundReplies }: RoomPayloadParams): string {
  const lines: string[] = []
  lines.push("<room_context>")
  lines.push(`You are in the "Mission Control Room" group chat on the Aivory dashboard. You are ${me.name} (${me.title}).`)
  if (peers.length > 0) {
    lines.push(
      `Also answering in this round: ${peers.map((p) => `${p.name} (${p.title})`).join(", ")}. ` +
        "Each of you replies separately and the user sees all replies side by side.",
    )
  } else {
    lines.push("You are the only agent answering in this round.")
  }
  lines.push(
    "Read the whole user message and work out what is asked of YOU specifically — it may ask you to help another member, or ask another member to help you. " +
      "Coordinate with what the others say instead of repeating it. " +
      "Reply as yourself in the user's language. Do not impersonate other members and do not echo these tags.",
  )
  lines.push("</room_context>")

  const recent = history.filter((h) => h.text.trim()).slice(-MAX_HISTORY_ENTRIES)
  if (recent.length > 0) {
    lines.push("<room_history>")
    for (const h of recent) lines.push(`${h.author}: ${clip(h.text, MAX_HISTORY_CHARS)}`)
    lines.push("</room_history>")
  }

  if (roundReplies.length > 0) {
    lines.push("<round_replies>")
    lines.push("These members already replied in this round — build on them, don't repeat them:")
    for (const r of roundReplies) lines.push(`${r.author}: ${clip(r.text, MAX_REPLY_CHARS)}`)
    lines.push("</round_replies>")
  }

  lines.push("<user_message>")
  lines.push(userText.trim())
  lines.push("</user_message>")
  return lines.join("\n")
}
