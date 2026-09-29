/**
 * "Connect Lex" orchestration: mint a CRM token and register the Aivory CRM MCP
 * server on the agent in one go, so the user never handles the token. Written
 * against injected deps so the ordering and cleanup rules are unit-testable.
 */
import type { RegisterServerInput, TenantMcpServer } from "./tenantMcpServers"

export const CRM_MCP_URL = "https://api.aivory.id/crm/mcp"
export const CRM_SERVER_NAME = "aivory-crm"
export const LEX_AGENT = "leads_qualifier"
/** Marks grants created by the one-click flow, so Reconnect/Disconnect can find them. */
export const AUTO_GRANT_LABEL = "Lex (auto-connect)"

export type ConnectDeps = {
  createGrant: () => Promise<{ id: string; token: string }>
  revokeGrant: (id: string) => Promise<unknown>
  register: (input: RegisterServerInput) => Promise<TenantMcpServer>
  deleteServer: (id: string) => Promise<unknown>
}

const quietly = async (p: Promise<unknown>) => {
  try {
    await p
  } catch {
    // Cleanup is best effort; the original failure is what the user needs to see.
  }
}

/**
 * Registers the server. An existing one (same name) must be replaced first,
 * because the backend rejects a duplicate name with an unhelpful 503. If
 * registration or verification fails, nothing is left behind: the fresh token is
 * revoked and any row the backend persisted as failed is deleted.
 */
export async function connectAgent(
  deps: ConnectDeps,
  opts: { existingServerId?: string; oldGrantIds?: string[] } = {},
): Promise<TenantMcpServer> {
  if (opts.existingServerId) await deps.deleteServer(opts.existingServerId)

  const grant = await deps.createGrant()
  let server: TenantMcpServer
  try {
    server = await deps.register({
      agent_type: LEX_AGENT,
      name: CRM_SERVER_NAME,
      url: CRM_MCP_URL,
      transport: "streamable-http",
      auth_header_name: "Authorization",
      auth_header_value: `Bearer ${grant.token}`,
    })
  } catch (e) {
    const saved = (e as { server?: { id?: string } }).server
    if (saved?.id) await quietly(deps.deleteServer(saved.id))
    await quietly(deps.revokeGrant(grant.id))
    throw e
  }
  await Promise.all((opts.oldGrantIds ?? []).map((id) => quietly(deps.revokeGrant(id))))
  return server
}

export async function disconnectAgent(deps: ConnectDeps, serverId: string, grantIds: string[]): Promise<void> {
  await deps.deleteServer(serverId)
  await Promise.all(grantIds.map((id) => quietly(deps.revokeGrant(id))))
}
