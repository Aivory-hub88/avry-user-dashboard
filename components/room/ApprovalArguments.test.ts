import { describe, it, expect } from "vitest"
import { argumentRows } from "@/components/room/ApprovalArguments"

describe("argumentRows", () => {
  it("labels keys and keeps values", () => {
    expect(argumentRows({ to_email: "a@b.id", subject: "Hi" })).toEqual([
      { key: "To email", value: "a@b.id" },
      { key: "Subject", value: "Hi" },
    ])
  })

  it("drops empty values", () => {
    expect(argumentRows({ cc: "", bcc: null, tags: [], meta: {}, body: "x" })).toEqual([{ key: "Body", value: "x" }])
  })

  it("masks secrets", () => {
    expect(argumentRows({ api_key: "sk-123", Authorization: "Bearer z" }).map((r) => r.value)).toEqual(["••••••", "••••••"])
  })

  it("truncates long values and caps the field count", () => {
    const rows = argumentRows({ body: "a".repeat(2000) })
    expect(rows[0].value.length).toBe(601)
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, "v"]))
    expect(argumentRows(many)).toHaveLength(12)
  })

  it("tolerates missing input", () => {
    expect(argumentRows(undefined)).toEqual([])
  })
})
