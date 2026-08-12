/**
 * Tenant API-key deployment — lets an operator's own bot/app/backend talk to
 * their Aivory agent directly. See docs/ADR-006-CERVEAU-CLIENT-DEPLOYMENT-API.md.
 * Backend: avry-backend /api/v1/agent-api-keys (JWT). Listing/revoking an
 * existing key goes through lib/agentChat.ts's listDeployments()/
 * deleteDeployment() (kind: 'api') alongside Telegram/Slack — this module is
 * only the create flow, since a freshly-created key's plaintext value is
 * never retrievable again and doesn't fit that shared shape.
 */

import { authedFetch } from './deployAuth'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

export interface CreatedApiKey {
  id: string
  key: string // plaintext — shown exactly once, never returned by any other call
  key_prefix: string
  label: string | null
  agent_type: string
  created_at: string
}

export async function createAgentApiKey(agentType: string, label?: string): Promise<CreatedApiKey> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/agent-api-keys`, {
    method: 'POST',
    body: JSON.stringify({ agent_type: agentType, label: label || undefined }),
  })
  if (!res.ok) {
    const detail = await res.json().then((d) => d?.detail).catch(() => null)
    throw new Error(
      typeof detail === 'string' ? detail : `Failed to create API key (${res.status})`
    )
  }
  return res.json()
}
