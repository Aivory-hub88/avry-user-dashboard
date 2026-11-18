/**
 * WhatsApp deployable-agent API client (Aivory's shared number, via Kapso).
 *
 * Talks to avry-backend /api/v1/whatsapp/*. Same flow as Telegram: createWhatsappDeployLink() -> render
 * deep_link as a QR -> poll getWhatsappLinkStatus() until "connected" (the user sent LINK-xxxxxx to the number).
 * WhatsApp is a paid add-on: the backend answers 402 { code: 'whatsapp_addon_required' } until it is active.
 */

import { authedFetch } from './deployAuth'
import type { AgentType } from './agentRoster'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

export interface WhatsappDeployLink {
  token: string
  deep_link: string
  agent_type: string
  agent_name: string
  display_phone: string
  expires_at: string
}

export type WhatsappLinkStatus = 'pending' | 'connected' | 'expired' | 'not_found'

/** Thrown when the account has not bought the WhatsApp add-on, so the UI can offer it instead of an error. */
export class WhatsappAddonRequired extends Error {
  constructor(message = 'The WhatsApp add-on is not active for this account.') {
    super(message)
    this.name = 'WhatsappAddonRequired'
  }
}

export async function createWhatsappDeployLink(agentType: AgentType): Promise<WhatsappDeployLink> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/whatsapp/deploy-link`, {
    method: 'POST',
    body: JSON.stringify({ agent_type: agentType }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const detail = body?.detail
    if (res.status === 402 && detail && typeof detail === 'object' && detail.code === 'whatsapp_addon_required') {
      throw new WhatsappAddonRequired(detail.message)
    }
    throw new Error((typeof detail === 'string' ? detail : detail?.message) || `Deploy link failed (${res.status})`)
  }
  return res.json()
}

export async function getWhatsappLinkStatus(token: string): Promise<{ status: WhatsappLinkStatus }> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/whatsapp/link-status/${encodeURIComponent(token)}`)
  if (!res.ok) return { status: 'not_found' }
  return res.json()
}
