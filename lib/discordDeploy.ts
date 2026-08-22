/**
 * Discord deployable-agent API client.
 *
 * Talks to avry-backend /api/v1/discord/* (see backend discord routes).
 * Flow: createDeployLink() -> show the connect code + bot invite link ->
 * user invites the bot and types `/connect <code>` in Discord -> poll
 * getLinkStatus() until "connected".
 *
 * Unlike Telegram's QR deep-link, there's no equivalent one-tap flow on
 * Discord — the code is short and human-typed via a slash command instead.
 */

import { authedFetch } from './deployAuth'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

export type DiscordAgentType =
  | 'autonomous'
  | 'customer_service'
  | 'leads_qualifier'
  | 'finance_invoice_ops'
  | 'office_assistant'

export interface DiscordDeployLink {
  code: string
  invite_url: string
  agent_type: string
  agent_name: string
  expires_at: string
}

export type DiscordLinkStatus = 'pending' | 'connected' | 'expired' | 'not_found'

export async function createDiscordDeployLink(
  agentType: DiscordAgentType
): Promise<DiscordDeployLink> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/discord/deploy-link`, {
    method: 'POST',
    body: JSON.stringify({ agent_type: agentType }),
  })
  if (!res.ok) {
    const detail = await res.json().then((d) => d?.detail).catch(() => null)
    throw new Error(detail || `Deploy link failed (${res.status})`)
  }
  return res.json()
}

export async function getDiscordLinkStatus(
  code: string
): Promise<{ status: DiscordLinkStatus; channel_id?: string }> {
  const res = await authedFetch(
    `${BACKEND_URL}/api/v1/discord/link-status/${encodeURIComponent(code)}`
  )
  if (!res.ok) return { status: 'not_found' }
  return res.json()
}
