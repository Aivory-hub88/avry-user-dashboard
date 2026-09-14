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
