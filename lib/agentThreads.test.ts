import { describe, it, expect } from "vitest"
import { pickDirectThread } from "./agentThreads"

describe("pickDirectThread", () => {
  const room = { id: "room", agentType: null }
  const consoleWithLex = { id: "console", agentType: null }
  const lexOwn = { id: "lex", agentType: "leads_qualifier" }

  it("skips shared threads where the agent only appears in a bubble", () => {
    expect(pickDirectThread([room, consoleWithLex, lexOwn], "leads_qualifier")?.id).toBe("lex")
  })

  it("returns undefined when the agent owns no thread, so a fresh chat starts", () => {
    expect(pickDirectThread([room, consoleWithLex], "leads_qualifier")).toBeUndefined()
  })

  it("keeps most-recent-first order among the agent's own threads", () => {
    const older = { id: "old", agentType: "leads_qualifier" }
    expect(pickDirectThread([lexOwn, older], "leads_qualifier")?.id).toBe("lex")
  })

  it("the Console row (null) still opens a console-owned thread", () => {
    expect(pickDirectThread([lexOwn, room], null)?.id).toBe("room")
  })
})
