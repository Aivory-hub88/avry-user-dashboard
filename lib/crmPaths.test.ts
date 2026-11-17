import { describe, expect, it } from "vitest"
import { isAllowedCrmPath } from "./crmPaths"

const ID = "0885b765-8180-4f62-bc0d-2f43b3fce909"

describe("isAllowedCrmPath archive routes", () => {
  it("allows listing archived records and the archive switch for companies, contacts and deals", () => {
    for (const root of ["companies", "contacts", "deals"]) {
      expect(isAllowedCrmPath([root, "archived"], "GET")).toBe(true)
      expect(isAllowedCrmPath([root, ID, "archive"], "PATCH")).toBe(true)
    }
  })
  it("refuses everything else around them", () => {
    expect(isAllowedCrmPath(["activities", "archived"], "GET")).toBe(false)
    expect(isAllowedCrmPath(["grants", "archived"], "GET")).toBe(false)
    expect(isAllowedCrmPath(["contacts", "archived"], "DELETE")).toBe(false)
    expect(isAllowedCrmPath(["contacts", ID, "archive"], "DELETE")).toBe(false)
    expect(isAllowedCrmPath(["activities", ID, "archive"], "PATCH")).toBe(false)
    expect(isAllowedCrmPath(["contacts", "not-a-uuid", "archive"], "PATCH")).toBe(false)
  })
  it("keeps the existing rules", () => {
    expect(isAllowedCrmPath(["deals", ID, "stage"], "PATCH")).toBe(true)
    expect(isAllowedCrmPath(["deals"], "POST")).toBe(true)
    expect(isAllowedCrmPath(["secrets"], "GET")).toBe(false)
  })
})
