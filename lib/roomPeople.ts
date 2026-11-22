/**
 * Pure rules for the room panel's "+" pickers (add an agent / add a person).
 * No imports from the DB or the browser, so the rules are unit-testable.
 */
import { AGENT_ROSTER, type AgentRosterEntry } from "@/lib/agentRoster"
import { LEGACY_WORKSPACE } from "@/lib/teams"

export type PersonRole = "editor" | "viewer"

/** Roster agents not yet invited to the room, in roster order. */
export function addableAgents(inRoom: readonly string[]): AgentRosterEntry[] {
  const have = new Set(inRoom)
  return AGENT_ROSTER.filter((a) => !have.has(a.type))
}

/**
 * Where a new person goes. A team room keeps its people on the team (seats
 * are counted there); a room in the shared default workspace has no team, so
 * the person is granted this room only.
 */
export function personTarget(workspaceId: string | null | undefined): "team" | "room" {
  return !workspaceId || workspaceId === LEGACY_WORKSPACE ? "room" : "team"
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function parseEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  return EMAIL.test(v) ? v : null
}

/** Whether the email already belongs to someone in the room. */
export function alreadyInRoom(email: string, people: readonly { email?: string }[]): boolean {
  const e = email.trim().toLowerCase()
  return people.some((p) => p.email?.toLowerCase() === e)
}

/** Friendly copy for the failures the add endpoints return. */
export function addPersonError(status: number, message: string, target: "team" | "room"): string {
  if (status === 404) return "No Aivory account uses that email. Ask them to sign up first."
  if (status === 403 && /seat limit/i.test(message)) return "Your plan's seat limit is reached. Upgrade or free a seat to add more people."
  if (status === 403)
    return target === "team" ? "Only the team owner can add people to this team." : "Only the room owner can add people."
  return message || "Couldn't add them. Try again."
}

export function addAgentError(status: number, message: string): string {
  if (status === 403) return "Only the room owner can add agents."
  return message || "Couldn't add the agent. Try again."
}
