/** Only access tokens authenticate; refresh tokens (30-day, survive logout) don't. */
import { describe, it, expect, beforeAll } from "vitest"
import { NextRequest } from "next/server"
import jwt from "jsonwebtoken"
import { getAuthUserWithToken } from "@/lib/serverAuth"

const SECRET = "test-secret"

beforeAll(() => {
  process.env.JWT_SECRET = SECRET
})

const sign = (payload: Record<string, unknown>) => jwt.sign(payload, SECRET, { algorithm: "HS256", expiresIn: "1h" })
const req = (token: string, via: "header" | "cookie" = "header") =>
  new NextRequest("http://localhost/api/x", {
    headers: via === "header" ? { authorization: `Bearer ${token}` } : { cookie: `aivory_access_token=${token}` },
  })

describe("getAuthUserWithToken", () => {
  it("accepts access tokens, typed and legacy", () => {
    expect(getAuthUserWithToken(req(sign({ user_id: "u1", email: "a@b.co", type: "access" })))?.user.user_id).toBe("u1")
    expect(getAuthUserWithToken(req(sign({ user_id: "u1", account_type: "free" })))?.user.user_id).toBe("u1")
  })

  it("rejects refresh tokens, typed and legacy, from header or cookie", () => {
    expect(getAuthUserWithToken(req(sign({ user_id: "u1", session_id: "s1", type: "refresh" })))).toBeNull()
    expect(getAuthUserWithToken(req(sign({ user_id: "u1", session_id: "s1" })))).toBeNull()
    expect(getAuthUserWithToken(req(sign({ user_id: "u1", session_id: "s1" }), "cookie"))).toBeNull()
  })

  it("rejects other token kinds", () => {
    expect(getAuthUserWithToken(req(sign({ user_id: "u1", type: "impersonation" })))).toBeNull()
  })
})
