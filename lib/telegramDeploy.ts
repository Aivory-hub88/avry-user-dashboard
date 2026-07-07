/**
 * Telegram deployable-agent API client.
 *
 * Talks to avry-backend /api/v1/telegram/* (see backend telegram routes).
 * Flow: createDeployLink() -> render deep_link as QR -> poll getLinkStatus()
 * until "connected" (user scanned and tapped Start).
 */

import { authedFetch } from './deployAuth'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

export type TelegramAgentType =
  | 'autonomous'
  | 'customer_service'
  | 'leads_qualifier'
  | 'finance_invoice_ops'

export interface DeployLink {
  token: string
  deep_link: string
  agent_type: string
  agent_name: string
  expires_at: string
}

export type LinkStatus = 'pending' | 'connected' | 'expired' | 'not_found'

export async function createDeployLink(
  agentType: TelegramAgentType,
  chatTarget: 'private' | 'group' = 'private'
): Promise<DeployLink> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/telegram/deploy-link`, {
    method: 'POST',
    body: JSON.stringify({ agent_type: agentType, chat_target: chatTarget }),
  })
  if (!res.ok) {
    const detail = await res.json().then((d) => d?.detail).catch(() => null)
    throw new Error(detail || `Deploy link failed (${res.status})`)
  }
  return res.json()
}

export async function getLinkStatus(
  token: string
): Promise<{ status: LinkStatus; chat_id?: number }> {
  const res = await authedFetch(
    `${BACKEND_URL}/api/v1/telegram/link-status/${encodeURIComponent(token)}`
  )
  if (!res.ok) return { status: 'not_found' }
  return res.json()
}
