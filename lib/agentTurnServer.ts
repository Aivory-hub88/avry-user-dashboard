/**
 * Run one turn of a tenant's own agent (Lex, Teo, ...) with no signed-in user: the WhatsApp CRM asks the
 * customer's agent for a reply draft. Calls avry-backend's internal endpoint, authenticated by the
 * dedicated DASHBOARD_AGENT_TURN_TOKEN (not a user JWT). SERVER-ONLY.
 */
const BACKEND = (process.env.BACKEND_SERVICE_URL || 'http://avry-backend:8081').replace(/\/$/, '')

export type AgentTurn = { reply: string | null; pendingApproval: boolean }

/** The backend keeps long turns alive with leading spaces, so the body is JSON preceded by whitespace. */
export function parseAgentTurn(body: string): AgentTurn {
  try {
    const j = JSON.parse(body.trim()) as { reply?: unknown; pending_approval?: unknown; detail?: unknown }
    const reply = typeof j.reply === 'string' && j.reply.trim() ? j.reply : null
    return { reply: j.detail ? null : reply, pendingApproval: !!j.pending_approval }
  } catch {
    return { reply: null, pendingApproval: false }
  }
}

export async function runAgentTurn(a: { tenantId: string; agentType: string; conversationId: string; text: string }, f: typeof fetch = fetch): Promise<AgentTurn> {
  const token = process.env.DASHBOARD_AGENT_TURN_TOKEN
  if (!token) return { reply: null, pendingApproval: false }
  const r = await f(`${BACKEND}/api/v1/telegram/internal/agent-turn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-agent-turn-token': token },
    body: JSON.stringify({ tenant_user_id: a.tenantId, agent_type: a.agentType, text: a.text, conversation_id: a.conversationId }),
    signal: AbortSignal.timeout(170_000),
  })
  if (!r.ok) return { reply: null, pendingApproval: false }
  return parseAgentTurn(await r.text())
}
