/**
 * Per-agent external-toolkit scope — lets an operator turn off a Composio-
 * sourced toolkit (e.g. Zendesk for customer_service) their agent would
 * otherwise get, without touching the always-on native-bridge/OfficeCLI
 * tools. Backend: avry-backend /api/v1/agent-profiles/{agentType}/tools (JWT).
 *
 * Mirrors agentProfiles.ts's shape/conventions exactly.
 */

import { authedFetch } from './deployAuth'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

export interface ToolScope {
  agent_type: string
  tools: Record<string, boolean>
}

/**
 * `null` return means this agent type has no toggleable external toolkits
 * (backend 404s — see agent_tool_scope.py's TOGGLEABLE_TOOLKITS) — the
 * caller should render nothing for the Tools tab, not an error state.
 */
export async function getToolScope(agentType: string): Promise<ToolScope | null> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/agent-profiles/${agentType}/tools`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to load tool scope (${res.status})`)
  return res.json()
}

export async function saveToolScope(agentType: string, toolkits: Record<string, boolean>): Promise<void> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/agent-profiles/${agentType}/tools`, {
    method: 'PUT',
    body: JSON.stringify({ toolkits }),
  })
  if (!res.ok) throw new Error(`Failed to save tool scope (${res.status})`)
}
