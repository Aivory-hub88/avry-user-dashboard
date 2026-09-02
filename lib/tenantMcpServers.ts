/**
 * Tenant custom MCP servers — lets a Pro/Enterprise operator register their
 * own MCP server (a thin shim over their internal systems) so their Cerveau
 * agent can read/act on their own environment. See
 * docs/ADR-006-CERVEAU-CLIENT-DEPLOYMENT-API.md, Part B.
 *
 * Backend: avry-backend /api/v1/tenant-mcp-servers (JWT). Registration runs
 * a synchronous SSRF-guarded verification handshake — the POST call itself
 * can take a few seconds and can come back either 201 (verified, with a
 * live tool list) or 422 (verification_failed, with a reason and the
 * persisted row so it still shows up in a subsequent list() call).
 */

import { authedFetch } from './deployAuth'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

export interface VerifiedTool {
  name: string
  description: string
}

export interface TenantMcpServer {
  id: string
  agent_type: string
  name: string
  url: string
  transport: 'streamable-http' | 'sse'
  auth_header_name: string | null
  status: 'pending_verification' | 'verified' | 'verification_failed' | 'disabled'
  last_verified_at: string | null
  last_verify_error: string | null
  tool_count: number | null
  created_at: string
  /** This server's own last-verified tool list — empty until the first
   *  successful verification. */
  tools: VerifiedTool[]
  /** Tool names (from `tools`) the tenant has turned off via `updateDisabledTools`. */
  disabled_tools: string[]
}

export type RegisterResult = TenantMcpServer

export class TenantMcpServerError extends Error {
  status: number
  server?: TenantMcpServer

  constructor(message: string, status: number, server?: TenantMcpServer) {
    super(message)
    this.status = status
    this.server = server
  }
}

async function parseErrorAndThrow(res: Response): Promise<never> {
  const body = await res.json().catch(() => null)
  const detail = body?.detail
  // The registration route's 422 carries {error, reason, server} — the row
  // WAS persisted (as verification_failed), so surface both the reason and
  // the server so the caller can render it inline instead of just an error.
  if (detail && typeof detail === 'object' && 'reason' in detail) {
    throw new TenantMcpServerError(
      detail.reason || `Verification failed (${res.status})`,
      res.status,
      detail.server
    )
  }
  const message = typeof detail === 'string' ? detail : `Request failed (${res.status})`
  throw new TenantMcpServerError(message, res.status)
}

export async function listTenantMcpServers(agentType: string): Promise<TenantMcpServer[]> {
  const res = await authedFetch(
    `${BACKEND_URL}/api/v1/tenant-mcp-servers?agent_type=${encodeURIComponent(agentType)}`
  )
  if (!res.ok) await parseErrorAndThrow(res)
  const data = await res.json()
  return data.servers ?? []
}

export interface RegisterServerInput {
  agent_type: string
  name: string
  url: string
  transport: 'streamable-http' | 'sse'
  auth_header_name?: string
  auth_header_value?: string
}

/**
 * Throws TenantMcpServerError on both hard failures (400/403/503, no
 * `.server`) and on a verification failure (422, `.server` set to the
 * persisted row) — callers should check `error.server` to distinguish "the
 * server was saved but didn't verify" from "nothing was saved at all".
 */
export async function registerTenantMcpServer(input: RegisterServerInput): Promise<RegisterResult> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/tenant-mcp-servers`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!res.ok) await parseErrorAndThrow(res)
  return res.json()
}

export async function reverifyTenantMcpServer(id: string): Promise<RegisterResult> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/tenant-mcp-servers/${encodeURIComponent(id)}/reverify`, {
    method: 'POST',
  })
  if (!res.ok) await parseErrorAndThrow(res)
  return res.json()
}

/** Full replacement of the server's disabled-tool set — not a toggle of one
 *  name — since the backend validates the whole list against its stored
 *  tools_json in one pass. Callers should send the complete set they want
 *  disabled after each checkbox change. */
export async function updateDisabledTools(id: string, disabledTools: string[]): Promise<TenantMcpServer> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/tenant-mcp-servers/${encodeURIComponent(id)}/tools`, {
    method: 'PATCH',
    body: JSON.stringify({ disabled_tools: disabledTools }),
  })
  if (!res.ok) await parseErrorAndThrow(res)
  return res.json()
}

export async function deleteTenantMcpServer(id: string): Promise<void> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/tenant-mcp-servers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok) await parseErrorAndThrow(res)
}
