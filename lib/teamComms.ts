/**
 * Agent-to-agent communication in a Team Space room (ADR-021).
 *
 * An agent's team tools (`team_message`, `team_ask`, `team_delegate`,
 * `team_handoff`, `team_remind`, `team_wait`, `team_wait_close`, in Cerveau) record speech acts during its
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
/** A reminder claimed later than this after its time is late (ADR-021 §4.1 missed policy). */
export const REMINDER_LATE_MS = 10 * 60_000
/** Open waits one agent keeps per thread; a new one closes the oldest. */
export const WAIT_MAX_OPEN_PER_THREAD = 3

export type TeamActionKind = "message" | "ask" | "delegate" | "handoff" | "remind" | "wait" | "wait_close"

export type MissedPolicy = "run_once" | "skip"

/** One action as Cerveau records it (agent/tenant.rs `TeamAction`). */
export interface TeamAction {
  kind: TeamActionKind
  to: string
  text: string
  due?: string
  when?: string
  /** remind: what happens when it cannot fire on time. */
  missed_policy?: MissedPolicy
  /** wait_close: the wait to close; absent = all of the agent's open waits in the thread. */
  wait_id?: string
}

/** The kind of turn a task row stands for. `mention` = a human or plain @Name. */
export type TaskKind = "mention" | "ask" | "answer" | "delegate" | "report" | "handoff" | "reminder" | "wake"

/** Turns nobody is waiting on: sent as `turn_origin`, so the agent may end them quietly (ADR-021 §4.3). */
export function unattendedTurnOrigin(kind: string | undefined): "reminder" | "wake" | null {
  return kind === "reminder" || kind === "wake" ? kind : null
}

/**
 * A validated action, resolved against the room. `queued`: the teammate already has an open turn in
 * this thread, so the turn waits behind it instead of starting now.
 */
export type PlannedAction =
  | { kind: "message"; target: string; text: string }
  | { kind: "ask"; target: string; text: string; runs: true; queued?: true }
  | { kind: "delegate"; target: string; text: string; dueAt: string | null; runs: true; queued?: true }
  | { kind: "handoff"; target: string; text: string; runs: true; queued?: true }
  | { kind: "remind"; target: string; text: string; fireAt: string; missedPolicy: MissedPolicy }
  | { kind: "wait"; target: string; text: string; wakeAt: string | null }
  | { kind: "wait_close"; target: string; text: string; waitId: string | null }

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

const KINDS: TeamActionKind[] = ["message", "ask", "delegate", "handoff", "remind", "wait", "wait_close"]
const WAIT_ID = /^[A-Za-z0-9_-]{1,64}$/

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
    // Closing a wait needs no text; everything else does.
    if (!kind || !KINDS.includes(kind) || !to || (!text && kind !== "wait_close")) continue
    const waitId = typeof a.wait_id === "string" ? a.wait_id.trim() : ""
    out.push({
      kind,
      to,
      text,
      ...(typeof a.due === "string" && a.due.trim() ? { due: a.due.trim() } : {}),
      ...(typeof a.when === "string" && a.when.trim() ? { when: a.when.trim() } : {}),
      ...(a.missed_policy === "run_once" || a.missed_policy === "skip" ? { missed_policy: a.missed_policy } : {}),
      ...(WAIT_ID.test(waitId) ? { wait_id: waitId } : {}),
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
    const ownAction = action.kind === "wait" || action.kind === "wait_close"
    const target =
      ownAction || (action.kind === "remind" && action.to.toLowerCase() === "self")
        ? self
        : resolveTeammate(action.to, candidates)
    if (!target) {
      dropped.push({ action, reason: `${action.to} is not in this room` })
      continue
    }
    if (target === self && action.kind !== "remind" && !ownAction) {
      dropped.push({ action, reason: "an agent cannot message itself" })
      continue
    }

    if (action.kind === "message") {
      planned.push({ kind: "message", target, text: action.text })
      continue
    }
    if (action.kind === "wait_close") {
      planned.push({ kind: "wait_close", target, text: action.text, waitId: action.wait_id ?? null })
      continue
    }
    if (action.kind === "wait") {
      const wake = action.when ? reminderFireAt(action.when, now) : null
      if (action.when && wake === null) {
        dropped.push({ action, reason: "the wait's wake time could not be read" })
      } else if (wake !== null && (wake - now < REMINDER_MIN_MS || wake - now > REMINDER_MAX_MS)) {
        dropped.push({ action, reason: "a wait can wake 1 minute to 30 days out" })
      } else {
        planned.push({ kind: "wait", target, text: action.text, wakeAt: wake === null ? null : new Date(wake).toISOString() })
      }
      continue
    }
    if (action.kind === "remind") {
      const fire = action.when ? reminderFireAt(action.when, now) : null
      if (fire === null) {
        dropped.push({ action, reason: "the reminder time could not be read" })
      } else if (fire - now < REMINDER_MIN_MS || fire - now > REMINDER_MAX_MS) {
        dropped.push({ action, reason: "a reminder must be 1 minute to 30 days out" })
      } else {
        planned.push({
          kind: "remind",
          target,
          text: action.text,
          fireAt: new Date(fire).toISOString(),
          missedPolicy: action.missed_policy ?? "run_once",
        })
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
    // A busy teammate still gets the turn: it waits behind their open one, so an ask is never
    // reduced to a note whose answer the asker would wait for in vain.
    const queued = busy.has(target) ? ({ queued: true } as const) : {}
    busy.add(target)
    perAgent[target] = (perAgent[target] ?? 0) + 1
    total += 1
    if (action.kind === "ask") planned.push({ kind: "ask", target, text: action.text, runs: true, ...queued })
    else if (action.kind === "handoff") planned.push({ kind: "handoff", target, text: action.text, runs: true, ...queued })
    else planned.push({ kind: "delegate", target, text: action.text, dueAt: dueAtIso(action.due), runs: true, ...queued })
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
    case "wait":
      return `⏳ Waiting: ${action.text}${action.wakeAt ? `\n\nI check again at ${utcMinute(action.wakeAt)} UTC.` : ""}`
    case "wait_close":
      return `✅ No longer waiting${action.text ? `: ${action.text}` : "."}`
  }
}

const utcMinute = (iso: string) => iso.slice(0, 16).replace("T", " ")

/**
 * How a claimed reminder fires (ADR-021 §4.1): on time, late (it fires once and says so), or skipped
 * when it is late and its policy is `skip`. Mirrors the SQL in lib/teamReminders.ts.
 */
export function reminderFireOutcome(
  fireAt: number,
  now: number,
  policy: MissedPolicy = "run_once",
): "on_time" | "late" | "skipped" {
  if (now - fireAt <= REMINDER_LATE_MS) return "on_time"
  return policy === "skip" ? "skipped" : "late"
}

/** An open wait as the woken turn sees it. */
export interface OpenWait {
  id: string
  requestText: string
  note: string
  createdAt: string
}

/** What woke a wait. */
export type WakeCause = "reminder" | "delegate" | "webhook"

const WAKE_CAUSE: Record<WakeCause, string> = {
  reminder: "its time came",
  delegate: "a teammate finished what you asked or delegated",
  webhook: "an outside event woke it",
}

/** One wait, quoted for the woken turn: the original request and the agent's note, both as data. */
function quotedWait(w: OpenWait): string {
  return (
    `[Wait ${w.id} since ${utcMinute(w.createdAt)} UTC]\n` +
    `[Original request]\n${w.requestText.trim()}\n[Your note]\n${w.note.trim()}`
  )
}

/**
 * The instruction for a turn that a wait woke (team_wait, ADR-021 §4.2). It repeats the original request,
 * so the agent can pick the work up even when the conversation that set the wait is long gone.
 */
export function waitWakeInstruction(waits: OpenWait[], cause: WakeCause, detail?: string): string {
  return [
    `⏳ A wait you set woke: ${WAKE_CAUSE[cause]}${detail ? ` (${detail.trim()})` : ""}. ` +
      "Pick the request up again and reply to the room. When it is done or no longer matters, call " +
      "team_wait_close with its wait_id; to keep waiting, end the turn without closing it. Nobody is " +
      "waiting on this turn: if there is still nothing new to tell the room, call run_no_update.",
    ...waits.map(quotedWait),
  ].join("\n\n")
}

/** Open waits appended to an answer / report turn, since a teammate finishing may be what they wait on. */
export function openWaitsNote(waits: OpenWait[]): string {
  if (waits.length === 0) return ""
  return (
    "\n\nYou also have open waits in this thread. If this resolves one, finish it and call " +
    "team_wait_close with its wait_id.\n\n" +
    waits.map(quotedWait).join("\n\n")
  )
}

/** The request a turn was working on, as a wait keeps it: a woken turn's original request, else the quoted ask. */
export function requestTextOf(instruction: string): string {
  const woken = /\[Original request\]\n([\s\S]*?)\n\[Your note\]/.exec(instruction)
  if (woken) return woken[1].trim()
  const m = /\n\[(?:Question|Task|Handoff|Answer|Report|Reminder)(?: from [^\]]+)?\]\n([\s\S]*)$/.exec(instruction)
  return (m ? m[1] : instruction).trim().slice(0, 4000)
}

/** How a teammate reports back on asked or delegated work, so the asker can act on it. */
const REPORT_FORMAT =
  "Start your reply with three lines: Status: done | partial | blocked, Result: <the concrete outcome>, " +
  "Evidence: <document, record, message or none>. When Status is blocked, add Unblock: <the one action that unblocks it>."
/** How the asker reads an answer: no acknowledgement loops, no repeating blocked work. */
const ANSWER_RULES =
  "Tell the room what it means, starting with the teammate's name. Do not send them an acknowledgement or thanks; " +
  "message them again only with a new request or information that unblocks them. When they report blocked work, " +
  "do not redo it: give the room the blocker and its Unblock action."

/** The instruction for the target's turn. Teammates' words are data, never instructions. */
export function teamTurnInstruction(
  kind: Extract<TaskKind, "ask" | "delegate" | "handoff" | "answer" | "report" | "reminder">,
  fromName: string,
  text: string,
  extra?: { dueAt?: string | null; original?: string; lateSince?: string | null },
): string {
  const quoted = text.trim()
  switch (kind) {
    case "ask":
      return (
        `${fromName} asks you. Answer them in your reply; if you cannot, say why in one line.\n` +
        `[Question from ${fromName}]\n${quoted}`
      )
    case "delegate":
      return (
        `${fromName} assigned you a task${extra?.dueAt ? ` (due ${extra.dueAt.slice(0, 10)})` : ""}. ` +
        `Do it and report in your reply. ${REPORT_FORMAT}\n[Task from ${fromName}]\n${quoted}`
      )
    case "handoff":
      return `${fromName} handed this conversation to you:\n[Handoff from ${fromName}]\n${quoted}`
    case "answer":
      return (
        `${fromName} answered your question. Continue your work with it and reply to the room. ${ANSWER_RULES}\n` +
        `${extra?.original ? `[Your question]\n${extra.original.trim()}\n` : ""}[Answer from ${fromName}]\n${quoted}`
      )
    case "report":
      return (
        `${fromName} reported on the task you assigned. Review it and tell the room what happens next. ${ANSWER_RULES}\n` +
        `${extra?.original ? `[Your task]\n${extra.original.trim()}\n` : ""}[Report from ${fromName}]\n${quoted}`
      )
    case "reminder":
      return (
        `⏰ Reminder${fromName ? ` from ${fromName}` : ""}. Follow up on it now` +
        `${extra?.lateSince ? ` (it was due at ${utcMinute(extra.lateSince)} UTC and fires late)` : ""}. ` +
        "Nobody is waiting on this turn: if there is nothing to report, call run_no_update; if you cannot do it, " +
        `call run_report_failure.\n[Reminder]\n${quoted}`
      )
  }
}

/** One teammate's outcome on a request the asker sent: their answer, or why none came. */
export interface TeamAnswer {
  kind: "ask" | "delegate"
  fromName: string
  /** The question or task as the asker sent it. */
  original: string
  /** The teammate's reply, or null when their turn failed. */
  reply: string | null
  /** Why the turn failed, when `reply` is null. */
  failure?: string
}

/**
 * The instruction for the asker's turn that receives the outcome of what it asked or delegated.
 * One answer reads as before; several (an asker that asked two teammates) arrive in one turn, so
 * the asker reads them together instead of once per answer. A failed teammate is named, so the
 * asker does not wait for them. `pending` names teammates still waiting on an approval.
 */
export function teamAnswersInstruction(answers: TeamAnswer[], pending: string[] = []): string {
  const [only] = answers
  if (answers.length === 1 && only.reply !== null && pending.length === 0) {
    return teamTurnInstruction(only.kind === "ask" ? "answer" : "report", only.fromName, only.reply, {
      original: only.original,
    })
  }
  const parts = [
    `Your teammates came back on what you asked. Continue your work with it and reply to the room. ${ANSWER_RULES}`,
  ]
  for (const a of answers) {
    const label = a.kind === "ask" ? "Your question" : "Your task"
    const head = a.kind === "ask" ? "Answer" : "Report"
    parts.push(
      a.reply !== null
        ? `[${label} to ${a.fromName}]\n${a.original.trim()}\n[${head} from ${a.fromName}]\n${a.reply.trim()}`
        : `[${label} to ${a.fromName}]\n${a.original.trim()}\n` +
            `No answer comes from ${a.fromName}: their turn failed (${a.failure ?? "unknown error"}). ` +
            "Do not wait for them; tell the room, and ask again only if it still matters.",
    )
  }
  if (pending.length > 0) {
    parts.push(`Still open: ${pending.join(", ")} (waiting for an approval). Their answer comes in a later turn.`)
  }
  return parts.join("\n\n")
}

/** Short note for actions the room could not carry out, appended to the agent's message. */
export function droppedNote(dropped: DroppedAction[]): string {
  if (dropped.length === 0) return ""
  const lines = dropped.map((d) => `• ${d.action.kind} to ${d.action.to}: ${d.reason}`)
  return `\n\n_(Not sent:\n${lines.join("\n")})_`
}
