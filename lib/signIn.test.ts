import { describe, expect, it } from "vitest"
import { signInUrl } from "./signIn"

describe("signInUrl", () => {
  it("sends the user back to the page they were on", () => {
    expect(signInUrl("https://aivory.uk", { pathname: "/dashboard/crm/deal/abc", search: "?tab=people" })).toBe(
      "https://aivory.uk/login?next=%2Fdashboard%2Fcrm%2Fdeal%2Fabc%3Ftab%3Dpeople",
    )
  })
  it("falls back to plain /login without a useful page", () => {
    expect(signInUrl("https://aivory.uk/", null)).toBe("https://aivory.uk/login")
    expect(signInUrl("https://aivory.uk", { pathname: "/", search: "" })).toBe("https://aivory.uk/login")
    expect(signInUrl("https://aivory.uk", { pathname: "/login", search: "?x=1" })).toBe("https://aivory.uk/login")
  })
})
