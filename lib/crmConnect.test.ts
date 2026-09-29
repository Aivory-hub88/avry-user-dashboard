import { describe, it, expect, vi } from "vitest"
import { connectAgent, disconnectAgent, CRM_MCP_URL, CRM_SERVER_NAME, LEX_AGENT, type ConnectDeps } from "./crmConnect"
import type { TenantMcpServer } from "./tenantMcpServers"

const SERVER = { id: "srv-new", name: CRM_SERVER_NAME, status: "verified", tool_count: 11 } as unknown as TenantMcpServer

function deps(over: Partial<ConnectDeps> = {}) {
  const calls: string[] = []
  const d: ConnectDeps = {
    createGrant: vi.fn(async () => (calls.push("createGrant"), { id: "grant-new", token: "avry_crm_secret" })),
    revokeGrant: vi.fn(async (id: string) => void calls.push(`revoke:${id}`)),
    register: vi.fn(async () => (calls.push("register"), SERVER)),
    deleteServer: vi.fn(async (id: string) => void calls.push(`delete:${id}`)),
    ...over,
  }
  return { d, calls }
}

describe("connectAgent", () => {
  it("mints a token and registers the CRM server on Lex with it as a Bearer header", async () => {
    const { d } = deps()
    const res = await connectAgent(d)
    expect(res).toBe(SERVER)
    expect(d.register).toHaveBeenCalledWith({
      agent_type: LEX_AGENT,
      name: CRM_SERVER_NAME,
      url: CRM_MCP_URL,
      transport: "streamable-http",
      auth_header_name: "Authorization",
      auth_header_value: "Bearer avry_crm_secret",
    })
    expect(d.revokeGrant).not.toHaveBeenCalled()
    expect(JSON.stringify(res)).not.toContain("avry_crm_secret")
  })

  it("replaces an existing server BEFORE minting, then revokes the old auto-grants", async () => {
    const { d, calls } = deps()
    await connectAgent(d, { existingServerId: "srv-old", oldGrantIds: ["g1", "g2"] })
    expect(calls.slice(0, 3)).toEqual(["delete:srv-old", "createGrant", "register"])
    expect(calls).toEqual(expect.arrayContaining(["revoke:g1", "revoke:g2"]))
    expect(calls).not.toContain("revoke:grant-new")
  })

  it("aborts without minting anything if the old server cannot be removed", async () => {
    const { d } = deps({ deleteServer: vi.fn(async () => Promise.reject(new Error("backend down"))) })
    await expect(connectAgent(d, { existingServerId: "srv-old" })).rejects.toThrow("backend down")
    expect(d.createGrant).not.toHaveBeenCalled()
    expect(d.register).not.toHaveBeenCalled()
  })

  it("on a failed verification deletes the persisted row and revokes the fresh token", async () => {
    const failure = Object.assign(new Error("verification failed"), { server: { id: "srv-failed" } })
    const { d, calls } = deps({ register: vi.fn(async () => Promise.reject(failure)) })
    await expect(connectAgent(d, { oldGrantIds: ["g1"] })).rejects.toBe(failure)
    expect(calls).toEqual(["createGrant", "delete:srv-failed", "revoke:grant-new"])
    expect(calls).not.toContain("revoke:g1")
  })

  it("on a hard failure (nothing saved) only revokes the fresh token", async () => {
    const { d, calls } = deps({ register: vi.fn(async () => Promise.reject(new Error("paid plan required"))) })
    await expect(connectAgent(d)).rejects.toThrow("paid plan required")
    expect(calls).toEqual(["createGrant", "revoke:grant-new"])
  })

  it("keeps the original error even when cleanup itself fails", async () => {
    const { d } = deps({
      register: vi.fn(async () => Promise.reject(Object.assign(new Error("boom"), { server: { id: "s" } }))),
      deleteServer: vi.fn(async () => Promise.reject(new Error("cleanup failed"))),
      revokeGrant: vi.fn(async () => Promise.reject(new Error("cleanup failed too"))),
    })
    await expect(connectAgent(d)).rejects.toThrow("boom")
  })
})

describe("disconnectAgent", () => {
  it("removes the server, then revokes the auto-grants (best effort)", async () => {
    const { d, calls } = deps({ revokeGrant: vi.fn(async (id: string) => (id === "g1" ? Promise.reject(new Error("x")) : void 0)) })
    await disconnectAgent(d, "srv-1", ["g1", "g2"])
    expect(calls).toContain("delete:srv-1")
    expect(d.revokeGrant).toHaveBeenCalledTimes(2)
  })

  it("does not revoke anything if the server delete fails", async () => {
    const { d } = deps({ deleteServer: vi.fn(async () => Promise.reject(new Error("nope"))) })
    await expect(disconnectAgent(d, "srv-1", ["g1"])).rejects.toThrow("nope")
    expect(d.revokeGrant).not.toHaveBeenCalled()
  })
})
