/**
 * n8n over MCP — one per-user connection to the tenant's own n8n instance via
 * n8n's built-in MCP server (`<n8n>/mcp-server/http`), alongside the older
 * instance URL + REST API key path (which this module does not touch).
 * See docs/N8N-MCP-CONNECTION-PLAN-2026-11.md.
 *
 * Backend: avry-backend /api/v1/n8n-mcp-connection (JWT). The connection is
 * per user (not per agent): `agent_types` lists which agents may use it, and
 * only the `phase1_tools` (read + run) can ever be enabled. The token is
 * write-only — the backend never returns it, and this module never logs it.
 */

import { authedFetch } from './deployAuth'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

const BASE = `${BACKEND_URL}/api/v1/n8n-mcp-connection`

export type N8nMcpStatus = 'pending_verification' | 'verified' | 'verification_failed'

export interface N8nMcpTool {
  name: string
  description: string
  /** False = outside the phase 1 allow-list; locked, cannot be turned on. */
  available: boolean
  enabled: boolean
}

export interface N8nMcpConnection {
  url: string
  status: N8nMcpStatus
  risk_tier: string
  last_verified_at: string | null
  last_verify_error: string | null
  tool_count: number | null
  tools: N8nMcpTool[]
  enabled_tools: string[]
  agent_types: string[]
  created_at: string
  updated_at: string
}

export interface N8nMcpConnectionState {
  connection: N8nMcpConnection | null
  /** The only tools that may be enabled (search/inspect/run/read results). */
  phase1_tools: string[]
}

export class N8nMcpConnectionError extends Error {
  status: number
  /** Set on a 422: the connection WAS saved, it just did not verify. */
  connection?: N8nMcpConnection

  constructor(message: string, status: number, connection?: N8nMcpConnection) {
    super(message)
    this.name = 'N8nMcpConnectionError'
    this.status = status
    this.connection = connection
  }
}

async function parseErrorAndThrow(res: Response): Promise<never> {
  const body = await res.json().catch(() => null)
  const detail = body?.detail
  // 422 carries {error:'verification_failed', reason, connection}: the row
  // was persisted, so hand both back for inline display.
  if (detail && typeof detail === 'object' && 'reason' in detail) {
    throw new N8nMcpConnectionError(
      detail.reason || `Verification failed (${res.status})`,
      res.status,
      detail.connection ?? undefined,
    )
  }
  const message = typeof detail === 'string' ? detail : `Request failed (${res.status})`
  throw new N8nMcpConnectionError(message, res.status)
}

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authedFetch(`${BASE}${path}`, init)
  if (!res.ok) await parseErrorAndThrow(res)
  return res.json()
}

export async function getN8nMcpConnection(): Promise<N8nMcpConnectionState> {
  const data = await send<Partial<N8nMcpConnectionState>>('')
  return { connection: data.connection ?? null, phase1_tools: data.phase1_tools ?? [] }
}

/** Connect, or replace the existing connection. A bare token or one with a
 *  "Bearer " prefix are both accepted by the backend. */
export function connectN8nMcp(input: { url: string; token: string }): Promise<N8nMcpConnection> {
  return send('', { method: 'PUT', body: JSON.stringify({ url: input.url, token: input.token }) })
}

export function reverifyN8nMcp(): Promise<N8nMcpConnection> {
  return send('/reverify', { method: 'POST' })
}

export function replaceN8nMcpToken(token: string): Promise<N8nMcpConnection> {
  return send('/token', { method: 'PUT', body: JSON.stringify({ token }) })
}

/** Full replacement of the enabled set (a subset of `phase1_tools`). */
export function updateN8nMcpTools(enabledTools: string[]): Promise<N8nMcpConnection> {
  return send('/tools', { method: 'PUT', body: JSON.stringify({ enabled_tools: enabledTools }) })
}

/** Full replacement of the agents allowed to use the connection. */
export function updateN8nMcpAgents(agentTypes: string[]): Promise<N8nMcpConnection> {
  return send('/agents', { method: 'PUT', body: JSON.stringify({ agent_types: agentTypes }) })
}

export async function disconnectN8nMcp(): Promise<void> {
  const res = await authedFetch(BASE, { method: 'DELETE' })
  if (!res.ok) await parseErrorAndThrow(res)
}

/** Which user-facing message a failed call maps to (i18n key under `n8nMcp.errors`). */
export function n8nMcpErrorKind(
  err: unknown,
): 'https' | 'noCredit' | 'forbidden' | 'notFound' | 'verification' | 'rateLimited' | 'unavailable' | 'generic' {
  if (!(err instanceof N8nMcpConnectionError)) return 'generic'
  switch (err.status) {
    case 400: return 'https'
    case 402: return 'noCredit'
    case 403: return 'forbidden'
    case 404: return 'notFound'
    case 422: return 'verification'
    case 429: return 'rateLimited'
    case 503: return 'unavailable'
    default: return 'generic'
  }
}
