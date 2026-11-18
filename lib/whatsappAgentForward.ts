/**
 * Offers each inbound message on Aivory's shared number to avry-backend first. A number that deployed an agent
 * (via a LINK-xxxxxx code) is answered by that agent there; everything else stays on the CRM path. SERVER-ONLY.
 *
 * Backend answers `handled` (link redeemed or agent running), `duplicate` (provider retry) or `not_handled`.
 * Only `not_handled` continues to the CRM, so a bound user's chat never lands in the company CRM.
 * If the backend cannot be reached we fail open to the CRM: the message is kept rather than lost.
 */
import type { Inbound } from './whatsapp/types'

const BACKEND = (process.env.BACKEND_SERVICE_URL || 'http://avry-backend:8081').replace(/\/$/, '')

export type AgentDecision = 'handled' | 'duplicate' | 'not_handled'

export async function offerToAgent(m: Inbound, f: typeof fetch = fetch): Promise<AgentDecision> {
  const token = process.env.DASHBOARD_AGENT_TURN_TOKEN
  if (!token) return 'not_handled'
  try {
    const r = await f(`${BACKEND}/api/v1/whatsapp/inbound`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agent-turn-token': token },
      body: JSON.stringify({
        message_id: m.id,
        from: m.from,
        name: m.name,
        type: m.kind ?? 'text',
        text: m.text,
        media_id: m.mediaId,
        mime_type: m.mime,
        filename: m.filename,
      }),
      signal: AbortSignal.timeout(8_000),
    })
    if (!r.ok) return 'not_handled'
    const j = (await r.json().catch(() => null)) as { status?: unknown } | null
    return j?.status === 'handled' || j?.status === 'duplicate' ? j.status : 'not_handled'
  } catch (e) {
    console.error('[whatsapp agent] backend unreachable, falling back to CRM:', (e as Error).message)
    return 'not_handled'
  }
}

/** The messages the CRM should still see: the ones no deployed agent took. */
export async function withoutAgentMessages(msgs: Inbound[], f: typeof fetch = fetch): Promise<Inbound[]> {
  const verdicts = await Promise.all(msgs.map((m) => offerToAgent(m, f)))
  return msgs.filter((_, i) => verdicts[i] === 'not_handled')
}
