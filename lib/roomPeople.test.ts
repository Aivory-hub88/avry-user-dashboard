import { describe, expect, it } from "vitest"
import { personActions, roleLabel, addableAgents, addAgentError, addPersonError, alreadyInRoom, parseEmail, personTarget } from "@/lib/roomPeople"
import { AGENT_ROSTER } from "@/lib/agentRoster"

describe("roomPeople", () => {
  it("lists only agents not yet in the room", () => {
    const first = AGENT_ROSTER[0].type
    const out = addableAgents([first, "ghost"])
    expect(out.find((a) => a.type === first)).toBeUndefined()
    expect(out).toHaveLength(AGENT_ROSTER.length - 1)
    expect(addableAgents(AGENT_ROSTER.map((a) => a.type))).toEqual([])
  })

  it("routes people to the team, or to the room in the default workspace", () => {
    expect(personTarget("ws-123")).toBe("team")
    expect(personTarget("default")).toBe("room")
    expect(personTarget(null)).toBe("room")
  })

  it("validates and normalizes email", () => {
    expect(parseEmail("  Foo@Bar.COM ")).toBe("foo@bar.com")
    expect(parseEmail("nope")).toBeNull()
    expect(parseEmail("a@b")).toBeNull()
  })

  it("spots someone already in the room", () => {
    expect(alreadyInRoom("A@x.id", [{ email: "a@x.id" }, {}])).toBe(true)
    expect(alreadyInRoom("b@x.id", [{ email: "a@x.id" }])).toBe(false)
  })

  it("maps endpoint failures to plain copy", () => {
    expect(addPersonError(404, "user not found", "team")).toMatch(/No Aivory account/)
    expect(addPersonError(403, "seat limit reached", "team")).toMatch(/seat limit/)
    expect(addPersonError(403, "forbidden", "team")).toMatch(/team owner/)
    expect(addPersonError(403, "forbidden", "room")).toMatch(/room owner/)
    expect(addPersonError(500, "", "room")).toMatch(/Try again/)
    expect(addAgentError(403, "forbidden")).toMatch(/room owner/)
    expect(addAgentError(500, "db")).toBe("db")
  })

  it("offers WhatsApp-style actions only to managers, never on the owner or team", () => {
    const base = { canManage: true, source: "room" as const, role: "editor", isSelf: false }
    expect(personActions(base)).toEqual(["makeAdmin", "remove"])
    expect(personActions({ ...base, role: "admin" })).toEqual(["removeAdmin", "remove"])
    expect(personActions({ ...base, isSelf: true, role: "admin" })).toEqual(["removeAdmin"])
    expect(personActions({ ...base, canManage: false })).toEqual([])
    expect(personActions({ ...base, source: "owner" })).toEqual([])
    expect(personActions({ ...base, source: "team" })).toEqual([])
  })

  it("labels roles", () => {
    expect(roleLabel("admin")).toBe("Admin")
    expect(roleLabel("editor")).toBe("Member")
    expect(roleLabel("x")).toBe("x")
  })
})
