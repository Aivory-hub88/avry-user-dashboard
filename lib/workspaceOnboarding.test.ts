import { describe, expect, it } from "vitest"
import type { RequestWithTeam, TeamSummary } from "./requestsClient"
import { currentStepIndex, onboardingSteps } from "./workspaceOnboarding"

const team = (o: Partial<TeamSummary> = {}): TeamSummary => ({ id: "t1", name: "Ops", role: "owner", owner: "u", ...o }) as TeamSummary
const req = (o: Partial<RequestWithTeam> = {}): RequestWithTeam =>
  ({
    id: "r1",
    workspaceId: "t1",
    title: "Q4 report",
    goal: "",
    deadline: null,
    priority: "Med",
    status: "draft",
    requestedBy: "u",
    requestedByName: "U",
    fields: [],
    dataTable: { columns: [], rows: [] },
    members: [],
    agents: [],
    reviewer: null,
    reviewNote: null,
    reviewedAt: null,
    roomId: null,
    submittedAt: null,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    teamName: "Ops",
    ...o,
  }) as RequestWithTeam

const states = (s: ReturnType<typeof onboardingSteps>) => s.map((x) => x.state)

describe("onboardingSteps", () => {
  it("starts at creating a team", () => {
    const s = onboardingSteps({ teams: [], mine: [], inbox: [], rooms: [] })
    expect(states(s)).toEqual(["current", "upcoming", "upcoming", "upcoming"])
    expect(s[0].action?.to).toEqual({ kind: "createTeam" })
    expect(currentStepIndex(s)).toBe(0)
  })

  it("offers a new request, or the newest draft", () => {
    expect(onboardingSteps({ teams: [team()], mine: [], inbox: [], rooms: [] })[1].action?.to).toEqual({ kind: "newRequest" })
    const s = onboardingSteps({
      teams: [team()],
      mine: [req({ id: "old" }), req({ id: "new", updatedAt: "2026-11-05T00:00:00Z" })],
      inbox: [],
      rooms: [],
    })
    expect(s[1].action?.to).toEqual({ kind: "openRequest", id: "new" })
  })

  it("tells viewers they need editor access", () => {
    const s = onboardingSteps({ teams: [team({ role: "viewer" })], mine: [], inbox: [], rooms: [] })
    expect(s[1].action).toBeUndefined()
    expect(s[1].status).toMatch(/editor/)
  })

  it("points owners to their inbox, then requesters to changes, then waits", () => {
    const sub = req({ status: "submitted" })
    expect(onboardingSteps({ teams: [team()], mine: [sub], inbox: [sub], rooms: [] })[2].action?.to).toEqual({ kind: "reviewInbox" })
    expect(onboardingSteps({ teams: [team({ role: "editor" })], mine: [req({ status: "changes_requested" })], inbox: [], rooms: [] })[2].action?.to).toEqual({
      kind: "openRequest",
      id: "r1",
    })
    const waiting = onboardingSteps({ teams: [team({ role: "editor" })], mine: [sub], inbox: [], rooms: [] })
    expect(states(waiting)).toEqual(["done", "done", "current", "upcoming"])
    expect(waiting[2].status).toMatch(/Waiting for an owner of Ops/)
  })

  it("ignores withdrawn and rejected requests", () => {
    const s = onboardingSteps({ teams: [team()], mine: [req({ status: "withdrawn" }), req({ status: "rejected" })], inbox: [], rooms: [] })
    expect(states(s)).toEqual(["done", "current", "upcoming", "upcoming"])
  })

  it("opens the room once approved, and is done when a room exists", () => {
    const s = onboardingSteps({ teams: [team()], mine: [req({ status: "approved", roomId: "room1" })], inbox: [], rooms: [] })
    expect(s[3].action?.to).toEqual({ kind: "openRoom", id: "room1" })
    const done = onboardingSteps({ teams: [team()], mine: [], inbox: [], rooms: [{ id: "room1" }] })
    expect(states(done)).toEqual(["done", "done", "done", "done"])
    expect(currentStepIndex(done)).toBe(4)
  })
})
