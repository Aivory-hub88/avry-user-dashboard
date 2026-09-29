/** Pure helpers for the CRM activity log (kept free of React so they are unit-testable). */
import { AGENT_ROSTER } from "./agentRoster"

export const ACTIVITY_KINDS = ["note", "call", "email", "meeting", "task"] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]
export type SubjectType = "company" | "contact" | "deal"

export const KIND_META: Record<ActivityKind, { label: string; dot: string }> = {
  note: { label: "Note", dot: "bg-white/40" },
  call: { label: "Call", dot: "bg-sky-400" },
  email: { label: "Email", dot: "bg-violet-400" },
  meeting: { label: "Meeting", dot: "bg-amber-400" },
  task: { label: "Task", dot: "bg-emerald-400" },
}

export const SUBJECT_LABEL: Record<SubjectType, string> = { company: "Company", contact: "Contact", deal: "Deal" }

export const MAX_ACTIVITY_BODY = 10_000

/** "Lex (agent)" for a known agent type, the raw type otherwise. */
export function agentLabel(type: string): string {
  const hit = AGENT_ROSTER.find((a) => a.type === type)
  return `${hit ? hit.name : type} (agent)`
}

export type DueState = "none" | "overdue" | "today" | "upcoming"

const sameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** Past = overdue; later today = today; anything after = upcoming. */
export function dueState(due: string | null, now: Date = new Date()): DueState {
  if (!due) return "none"
  const d = new Date(due)
  if (!Number.isFinite(d.getTime())) return "none"
  if (d.getTime() < now.getTime()) return "overdue"
  return sameLocalDay(d, now) ? "today" : "upcoming"
}

export type ActivityState = "done" | DueState

/** A completed activity is "done" whatever its due date says. */
export function activityState(a: { due_at: string | null; completed_at: string | null }, now: Date = new Date()): ActivityState {
  return a.completed_at ? "done" : dueState(a.due_at, now)
}

/** Follow-ups (anything with a due date) and tasks can be ticked off; plain notes cannot. */
export function isCompletable(a: { due_at: string | null; kind: ActivityKind }): boolean {
  return a.due_at !== null || a.kind === "task"
}

export const DUE_TONE: Record<Exclude<ActivityState, "none">, string> = {
  done: "bg-emerald-500/15 text-emerald-300",
  overdue: "bg-red-500/10 text-red-300",
  today: "bg-amber-500/15 text-amber-300",
  upcoming: "bg-sky-500/15 text-sky-300",
}

/** Soonest (or most overdue) first. */
export function sortFollowUps<T extends { due_at: string | null }>(rows: T[]): T[] {
  return rows
    .filter((r) => r.due_at)
    .sort((a, b) => new Date(a.due_at as string).getTime() - new Date(b.due_at as string).getTime())
}

/** `<input type="datetime-local">` value (local time) to an ISO instant, or null when empty/invalid. */
export function localInputToIso(v: string): string | null {
  if (!v.trim()) return null
  const d = new Date(v)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

/** "3 Oct, 10:00" (adds the year when it is not the current one). */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ""
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}),
    hour: "2-digit",
    minute: "2-digit",
  })
}
