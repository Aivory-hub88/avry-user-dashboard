/**
 * Slack deployable-agent API client.
 *
 * Same flow shape as telegramDeploy.ts, with OAuth instead of a QR code:
 * createSlackDeployLink() -> open install_url in a new tab -> poll
 * getSlackLinkStatus() until "connected" (user approved the install).
 */

import { authedFetch } from './deployAuth'
import type { TelegramAgentType, LinkStatus } from './telegramDeploy'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

export interface SlackDeployLink {
  token: string
  install_url: string
  agent_type: string
  agent_name: string
  expires_at: string
}

export async function createSlackDeployLink(
  agentType: TelegramAgentType
): Promise<SlackDeployLink> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/slack/deploy-link`, {
    method: 'POST',
    body: JSON.stringify({ agent_type: agentType }),
  })
  if (!res.ok) {
    const detail = await res.json().then((d) => d?.detail).catch(() => null)
    throw new Error(detail || `Slack deploy link failed (${res.status})`)
  }
  return res.json()
}

export async function getSlackLinkStatus(
  token: string
): Promise<{ status: LinkStatus; team_id?: string }> {
  const res = await authedFetch(
    `${BACKEND_URL}/api/v1/slack/link-status/${encodeURIComponent(token)}`
  )
  if (!res.ok) return { status: 'not_found' }
  return res.json()
}
