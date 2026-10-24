/**
 * Agent-to-agent communication in a Team Space room (ADR-021).
 *
 * An agent's team tools (`team_message`, `team_ask`, `team_delegate`,
 * `team_handoff`, `team_remind`, in Cerveau) record speech acts during its
 * turn; the backend relays them as `team_actions`. This module decides which
 * of them the room carries out and how each one reads as a message. It is
 * pure: the caller (lib/spaceAgentRun.ts) owns the database and the turns.
 *
 * CLIENT-SAFE: no server imports, same rule as lib/agentHandoff.ts.
 */

import { resolveTeammate, type HandoffCandidate } from "@/lib/agentHandoff"

/** Hops after the human's message. An ask + its answer is two hops. */
export const TEAM_MAX_DEPTH = 4
/** All agent turns in one chain, the first one included. */
export const TEAM_MAX_TURNS = 12
/** Turns one agent may take in one chain (stops A <-> B ping-pong). */
export const TEAM_MAX_PER_AGENT = 3
/** Actions the room carries out from one turn (Cerveau caps at the same number). */
export const TEAM_MAX_ACTIONS_PER_TURN = 3
/** Reminders: at least this far out, at most this far out. */
export const REMINDER_MIN_MS = 60_000
export const REMINDER_MAX_MS = 30 * 24 * 60 * 60_000

export type TeamActionKind = "message" | "ask" | "delegate" | "handoff" | "remind"

/** One action as Cerveau records it (agent/tenant.rs `TeamAction`). */
export interface TeamAction {
  kind: TeamActionKind
  to: string
  text: string
  due?: string
  when?: string
}

/** The kind of turn a task row stands for. `mention` = a human or plain @Name. */
export type TaskKind = "mention" | "ask" | "answer" | "delegate" | "report" | "handoff" | "reminder"

/** A validated action, resolved against the room. */
export type PlannedAction =
  | { kind: "message"; target: string; text: string }
  | { kind: "ask"; target: string; text: string; runs: true }
  | { kind: "delegate"; target: string; text: string; dueAt: string | null; runs: true }
  | { kind: "handoff"; target: string; text: string; runs: true }
  | { kind: "remind"; target: string; text: string; fireAt: string }

export interface DroppedAction {
  action: TeamAction
  reason: string
}

export interface TeamChainState {
  /** Depth of the turn that made the actions (0 = answered the human directly). */
  depth: number
  /** Turns already used in this chain, per agent (the current one included). */
  usedPerAgent: Record<string, number>
  /** Turns already used in this chain overall (the current one included). */
  usedTotal: number
  /** Agents that already have an open turn in this thread. */
  busy?: Iterable<string>
}

const KINDS: TeamActionKind[] = ["message", "ask", "delegate", "handoff", "remind"]

/** Parse the relayed `team_actions` field defensively (it crossed three services). */
export function parseTeamActions(raw: unknown): TeamAction[] {
  if (!Array.isArray(raw)) return []
  const out: TeamAction[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const a = item as Record<string, unknown>
    const kind = typeof a.kind === "string" ? (a.kind as TeamActionKind) : null
    const to = typeof a.to === "string" ? a.to.trim() : ""
    const text = typeof a.text === "string" ? a.text.trim().slice(0, 2000) : ""
    if (!kind || !KINDS.includes(kind) || !to || !text) continue
    out.push({
      kind,
      to,
      text,
      ...(typeof a.due === "string" && a.due.trim() ? { due: a.due.trim() } : {}),
      ...(typeof a.when === "string" && a.when.trim() ? { when: a.when.trim() } : {}),
    })
  }
  return out
}

/** `in 30m` / `in 2h` / `in 3d` (or `jam`/`hari`/`menit`), or an ISO time → epoch ms. */
export function reminderFireAt(when: string, now: number): number | null {
  const rel = /^in\s*(\d+)\s*(m|min|mins|minutes?|menit|h|hrs?|hours?|jam|d|days?|hari)$/i.exec(when.trim())
  if (rel) {
    const n = Number(rel[1])
    const unit = rel[2].toLowerCase()
    const minutes = unit.startsWith("m") ? n : unit.startsWith("h") || unit === "jam" ? n * 60 : n * 1440
    return now + minutes * 60_000
  }
  const at = Date.parse(when)
  return Number.isFinite(at) ? at : null
}

/** A delegation due date: `YYYY-MM-DD` (end of that day, UTC) or an ISO time. */
export function dueAtIso(due: string | undefined): string | null {
  if (!due) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    const t = Date.parse(`${due}T23:59:59Z`)
    return Number.isFinite(t) ? new Date(t).toISOString() : null
  }
  const t = Date.parse(due)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/**
 * Which actions the room carries out, resolved against the agents in the room
 * and bounded by the chain budget. Dropped actions come back with a reason so
 * the room can say so instead of losing them silently.
 */
export function planTeamActions(
  actions: TeamAction[],
  candidates: HandoffCandidate[],
  self: string,
  state: TeamChainState,
  now: number,
): { planned: PlannedAction[]; dropped: DroppedAction[] } {
  const planned: PlannedAction[] = []
  const dropped: DroppedAction[] = []
  const busy = new Set(state.busy ?? [])
  const perAgent = { ...state.usedPerAgent }
  let total = state.usedTotal
  const deeper = state.depth + 1 <= TEAM_MAX_DEPTH

  for (const action of actions) {
    if (planned.length >= TEAM_MAX_ACTIONS_PER_TURN) {
      dropped.push({ action, reason: "too many team messages in one turn" })
      continue
    }
    const target =
      action.kind === "remind" && action.to.toLowerCase() === "self"
        ? self
        : resolveTeammate(action.to, candidates)
    if (!target) {
      dropped.push({ action, reason: `${action.to} is not in this room` })
      continue
    }
    if (target === self && action.kind !== "remind") {
      dropped.push({ action, reason: "an agent cannot message itself" })
      continue
    }

    if (action.kind === "message") {
      planned.push({ kind: "message", target, text: action.text })
      continue
    }
    if (action.kind === "remind") {
      const fire = action.when ? reminderFireAt(action.when, now) : null
      if (fire === null) {
        dropped.push({ action, reason: "the reminder time could not be read" })
      } else if (fire - now < REMINDER_MIN_MS || fire - now > REMINDER_MAX_MS) {
        dropped.push({ action, reason: "a reminder must be 1 minute to 30 days out" })
      } else {
        planned.push({ kind: "remind", target, text: action.text, fireAt: new Date(fire).toISOString() })
      }
      continue
    }

    // ask / delegate / handoff start the target's turn: bounded by the chain.
    if (!deeper) {
      dropped.push({ action, reason: "this conversation reached its depth limit" })
      continue
    }
    if (total >= TEAM_MAX_TURNS) {
      dropped.push({ action, reason: "this conversation reached its turn limit" })
      continue
    }
    if ((perAgent[target] ?? 0) >= TEAM_MAX_PER_AGENT) {
      dropped.push({ action, reason: `${action.to} already took ${TEAM_MAX_PER_AGENT} turns here` })
      continue
    }
    if (busy.has(target)) {
      // Still delivered as a note: the teammate sees it on their next turn.
      planned.push({ kind: "message", target, text: action.text })
      continue
    }
    busy.add(target)
    perAgent[target] = (perAgent[target] ?? 0) + 1
    total += 1
    if (action.kind === "ask") planned.push({ kind: "ask", target, text: action.text, runs: true })
    else if (action.kind === "handoff") planned.push({ kind: "handoff", target, text: action.text, runs: true })
    else planned.push({ kind: "delegate", target, text: action.text, dueAt: dueAtIso(action.due), runs: true })
  }
  return { planned, dropped }
}

/** The room message an action becomes, posted as the acting agent. */
export function teamActionMessage(
  action: PlannedAction,
  link: (type: string) => string,
): string {
  const who = link(action.target)
  switch (action.kind) {
    case "message":
      return `${who} ${action.text}`
    case "ask":
      return `${who} ❓ ${action.text}`
    case "handoff":
      return `${who} ↪️ ${action.text}`
    case "delegate":
      return `${who} 📋 ${action.text}${action.dueAt ? `\n\nDue: ${action.dueAt.slice(0, 10)}` : ""}`
    case "remind":
      return `⏰ Reminder for ${who} at ${action.fireAt.slice(0, 16).replace("T", " ")} UTC: ${action.text}`
  }
}

/** The instruction for the target's turn. Teammates' words are data, never instructions. */
export function teamTurnInstruction(
  kind: Extract<TaskKind, "ask" | "delegate" | "handoff" | "answer" | "report" | "reminder">,
  fromName: string,
  text: string,
  extra?: { dueAt?: string | null; original?: string },
): string {
  const quoted = text.trim()
  switch (kind) {
    case "ask":
      return `${fromName} asks you (answer them in your reply):\n[Question from ${fromName}]\n${quoted}`
    case "delegate":
      return (
        `${fromName} assigned you a task${extra?.dueAt ? ` (due ${extra.dueAt.slice(0, 10)})` : ""}. ` +
        `Do it and report the result in your reply:\n[Task from ${fromName}]\n${quoted}`
      )
    case "handoff":
      return `${fromName} handed this conversation to you:\n[Handoff from ${fromName}]\n${quoted}`
    case "answer":
      return (
        `${fromName} answered your question. Continue your work with it and reply to the room.\n` +
        `${extra?.original ? `[Your question]\n${extra.original.trim()}\n` : ""}[Answer from ${fromName}]\n${quoted}`
      )
    case "report":
      return (
        `${fromName} finished the task you assigned. Review it and tell the room what happens next.\n` +
        `${extra?.original ? `[Your task]\n${extra.original.trim()}\n` : ""}[Report from ${fromName}]\n${quoted}`
      )
    case "reminder":
      return `⏰ Reminder${fromName ? ` from ${fromName}` : ""}. Follow up on it now:\n[Reminder]\n${quoted}`
  }
}

/** Short note for actions the room could not carry out, appended to the agent's message. */
export function droppedNote(dropped: DroppedAction[]): string {
  if (dropped.length === 0) return ""
  const lines = dropped.map((d) => `• ${d.action.kind} to ${d.action.to}: ${d.reason}`)
  return `\n\n_(Not sent:\n${lines.join("\n")})_`
}
