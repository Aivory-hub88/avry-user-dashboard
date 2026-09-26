/**
 * Room chat model (ADR-019 P2) — pure helpers for the Console-style room
 * feed. Client-safe, no I/O.
 *
 * The Console composer inserts plain "@Lex"; the server only treats
 * `[@Lex](#agent:leads_qualifier)` token links as mentions (bare @word is
 * prose, see lib/spaceProtocol). So outgoing text is tokenised for the
 * room's agents, and stored bodies are shown with tokens folded back to
 * their labels.
 */
import type { SpaceAgentTask } from "@/lib/spaceAgent"

export interface RoomAgent {
  type: string
  name: string
}

export interface TimelineMessage {
  id: string
  threadRoot: string | null
  author: { memberId: string; actingMode: string; agentName?: string; agentType?: string }
  authorName: string
  body: string
  createdAt: string
  deletedAt?: string | null
  replyTo: { id: string; kind: string; authorId?: string; name: string; agentType: string | null; body: string } | null
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** "@Lex check this" → "[@Lex](#agent:leads_qualifier) check this" for agents in the room. */
export function tokenizeMentions(text: string, agents: RoomAgent[]): string {
  let out = text
  for (const a of agents) {
    const re = new RegExp(`(^|[\\s(])@${escapeRe(a.name)}(?![\\w\\]])`, "gi")
    out = out.replace(re, (_, pre: string) => `${pre}[@${a.name}](#agent:${a.type})`)
  }
  return out
}

/** Agents a text mentions, as tokenised by tokenizeMentions. */
export function mentionedAgents(tokenised: string): string[] {
  const out: string[] = []
  const re = /\]\(#agent:([a-z_]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tokenised)) !== null) if (!out.includes(m[1])) out.push(m[1])
  return out
}

/** Token links → their visible label ("[@Lex](#agent:x)" → "@Lex"). */
export function displayBody(body: string): string {
  return body.replace(/\[(@[^\[\]\\]+|#[^\[\]\\]+)\]\(#(?:member:[^)\s]+|agent:[^)\s]+|here|doc:[^)\s]+)\)/g, "$1")
}

/** A readable name for a person: full name when known, else the email's local part. */
export function personName(authorName: string, knownName?: string | null): string {
  if (knownName && knownName.trim()) return knownName.trim()
  const n = authorName.trim()
  if (!n) return "Someone"
  return n.includes("@") ? n.split("@")[0] : n
}

export type TaskRow =
  | { kind: "thinking"; task: SpaceAgentTask }
  | { kind: "approval"; task: SpaceAgentTask }
  | { kind: "failed"; task: SpaceAgentTask }

/**
 * Agent tasks that still need a row under the feed: running (thinking),
 * waiting on an approval, or failed with no reply since. Done/cancelled
 * tasks already show up as the agent's message (or nothing).
 */
export function openTaskRows(tasks: SpaceAgentTask[], messages: TimelineMessage[]): TaskRow[] {
  const rows: TaskRow[] = []
  const sorted = [...tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  for (const t of sorted) {
    if (t.status === "todo" || t.status === "in_progress") rows.push({ kind: "thinking", task: t })
    else if (t.status === "blocked") rows.push({ kind: "approval", task: t })
    else if (t.status === "failed") {
      const repliedSince = messages.some(
        (m) => m.author.actingMode === "agent" && m.author.agentType === t.agentType && m.createdAt > t.updatedAt,
      )
      if (!repliedSince) rows.push({ kind: "failed", task: t })
    }
  }
  return rows
}

/** One-line quote text: tokens folded, markdown marks and list bullets dropped. */
export function quoteText(body: string): string {
  return displayBody(body)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/gm, "")
    .replace(/(\*\*|__|\*|_|~~)(\S(?:[^]*?\S)?)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim()
}
