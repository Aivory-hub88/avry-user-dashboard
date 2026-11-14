/**
 * Workspace onboarding: where a user stands on the way from "no team" to
 * "first room open". Pure, so the stepper and its tests share one source.
 *
 *   1 Create a team → 2 Request a project → 3 Team admin approves → 4 Room opens
 */
import type { RequestWithTeam, TeamSummary } from "./requestsClient"

export type StepKey = "team" | "request" | "approval" | "room"
export type StepState = "done" | "current" | "upcoming"

/** What the step's button does; the page turns it into a link or a modal. */
export type StepAction =
  | { kind: "createTeam" }
  | { kind: "newRequest" }
  | { kind: "openRequest"; id: string }
  | { kind: "reviewInbox" }
  | { kind: "openRoom"; id: string }

export interface OnboardingStep {
  key: StepKey
  title: string
  body: string
  state: StepState
  /** Status line for the current step, e.g. "Waiting for Ops to review". */
  status?: string
  action?: { label: string; to: StepAction }
}

export interface OnboardingInput {
  teams: TeamSummary[]
  mine: RequestWithTeam[]
  inbox: RequestWithTeam[]
  rooms: { id: string }[]
}

const newest = (rs: RequestWithTeam[]) => [...rs].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0]

export function onboardingSteps({ teams, mine, inbox, rooms }: OnboardingInput): OnboardingStep[] {
  const canRequest = teams.some((t) => t.role === "owner" || t.role === "editor")
  const live = mine.filter((r) => r.status !== "withdrawn" && r.status !== "rejected")
  const drafts = live.filter((r) => r.status === "draft")
  const sent = live.filter((r) => r.status !== "draft")
  const submitted = sent.filter((r) => r.status === "submitted")
  const changes = sent.filter((r) => r.status === "changes_requested")
  const approved = sent.filter((r) => r.status === "approved")
  const toReview = inbox.filter((r) => r.status === "submitted")

  const hasTeam = teams.length > 0
  const hasRoom = rooms.length > 0
  const requested = hasRoom || sent.length > 0
  const isApproved = hasRoom || approved.length > 0

  const steps: OnboardingStep[] = [
    {
      key: "team",
      title: "Create a team",
      body: "Add the people who work with you. Owners approve projects; editors can request them.",
      state: hasTeam ? "done" : "current",
      action: hasTeam ? undefined : { label: "Create a team", to: { kind: "createTeam" } },
    },
    {
      key: "request",
      title: "Request a project",
      body: "Describe the goal and deadline, add data and files, and pick which agents should help.",
      state: requested ? "done" : hasTeam ? "current" : "upcoming",
    },
    {
      key: "approval",
      title: "A team owner approves it",
      body: "The owner reads the request, asks for changes if something is missing, and approves it.",
      state: isApproved ? "done" : requested ? "current" : "upcoming",
    },
    {
      key: "room",
      title: "Your room opens",
      body: "The team and its agents work in one room: chat, tasks and notes, with approvals when agents need you.",
      state: hasRoom ? "done" : isApproved ? "current" : "upcoming",
    },
  ]

  const [, request, approval, room] = steps
  if (request.state === "current") {
    const draft = newest(drafts)
    if (draft) {
      request.status = `Draft: ${draft.title}`
      request.action = { label: "Finish your draft", to: { kind: "openRequest", id: draft.id } }
    } else if (canRequest) {
      request.action = { label: "Request a project", to: { kind: "newRequest" } }
    } else {
      request.status = "You can view your teams but not request projects. Ask a team owner to make you an editor."
    }
  }
  if (approval.state === "current") {
    const mineToReview = toReview[0]
    const change = newest(changes)
    if (mineToReview) {
      approval.status = toReview.length === 1 ? `"${mineToReview.title}" is waiting for your review` : `${toReview.length} requests are waiting for your review`
      approval.action = { label: "Review requests", to: { kind: "reviewInbox" } }
    } else if (change) {
      approval.status = `Changes requested on "${change.title}"`
      approval.action = { label: "See what to change", to: { kind: "openRequest", id: change.id } }
    } else {
      const s = newest(submitted)
      if (s) {
        approval.status = `Waiting for an owner of ${s.teamName} to review "${s.title}"`
        approval.action = { label: "View request", to: { kind: "openRequest", id: s.id } }
      }
    }
  }
  if (room.state === "current") {
    const withRoom = newest(approved.filter((r) => r.roomId))
    if (withRoom?.roomId) room.action = { label: "Open the room", to: { kind: "openRoom", id: withRoom.roomId } }
    else room.status = "Approved. The room is being set up."
  }
  return steps
}

/** 0-based index of the first step that isn't done, or the length when all are. */
export function currentStepIndex(steps: OnboardingStep[]): number {
  const i = steps.findIndex((s) => s.state !== "done")
  return i === -1 ? steps.length : i
}
