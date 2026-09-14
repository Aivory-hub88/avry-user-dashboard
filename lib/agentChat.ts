/**
 * Deployable-agent access from the dashboard.
 *
 * - sendAgentMessage(): talk to a prebuilt agent from the AI Console
 *   (backend /api/v1/telegram/agent-chat, JWT). Non-streaming: the agent may
 *   run tools before answering, so a reply can take 5-30s.
 * - listDeployments()/deleteDeployment(): where each agent is deployed
 *   (Telegram chats + Slack workspaces) and disconnecting them.
 */

import { authedFetch } from './deployAuth'
import { AGENT_ROSTER, type AgentRosterEntry, type AgentType } from './agentRoster'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

export type PrebuiltAgent = AgentRosterEntry

/** Sourced from lib/agentRoster.ts's single AGENT_ROSTER. */
export const PREBUILT_AGENTS: PrebuiltAgent[] = [...AGENT_ROSTER]

/** Minimal shape Cerveau's own /webhook response carries — no `arguments`,
 *  unlike the dashboard Approvals page's richer PendingApproval (that one
 *  comes from a list endpoint that reads the full stored row; this one is
 *  relayed live through vps-bridge from the turn that just parked it). */
export interface ConsolePendingApproval {
  id: string
  tool_name: string
  risk_tier: string
}

export interface AgentChatResult {
  reply: string
  pendingApproval: ConsolePendingApproval | null
}

export async function sendAgentMessage(
  agentType: AgentType,
  text: string,
  conversationId?: string
): Promise<AgentChatResult> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/telegram/agent-chat`, {
    method: 'POST',
    body: JSON.stringify({
      agent_type: agentType,
      text,
      conversation_id: conversationId,
    }),
  })
  if (!res.ok) {
    const detail = await res.json().then((d) => d?.detail).catch(() => null)
    throw new Error(detail || `Agent chat failed (${res.status})`)
  }
  const data = await res.json()
  return {
    reply: data.reply as string,
    pendingApproval: data.pending_approval ?? null,
  }
}

export interface AgentDeployment {
  kind: 'telegram' | 'slack' | 'api'
  /** binding_id (telegram), team_id (slack), or key id (api) — used for disconnect */
  id: string
  agentType: string
  /** Chat title / workspace name / key label shown to the user */
  label: string
}

export async function listDeployments(): Promise<AgentDeployment[]> {
  const [tgRes, slackRes, apiRes] = await Promise.allSettled([
    authedFetch(`${BACKEND_URL}/api/v1/telegram/bindings`),
    authedFetch(`${BACKEND_URL}/api/v1/slack/installations`),
    authedFetch(`${BACKEND_URL}/api/v1/agent-api-keys`),
  ])

  const out: AgentDeployment[] = []

  if (tgRes.status === 'fulfilled' && tgRes.value.ok) {
    const data = await tgRes.value.json().catch(() => null)
    for (const b of data?.bindings ?? []) {
      // For private chats, chat_title is the connecting user's OWN Telegram
      // name/username (not the bot's) — showing it reads as a random person's
      // handle. Groups have a real chat_title worth showing; private chats
      // should identify the bot persona instead.
      const label =
        b.chat_type === 'group' && b.chat_title
          ? b.chat_title
          : b.bot_username
            ? `@${b.bot_username}`
            : 'Telegram chat'
      out.push({
        kind: 'telegram',
        id: b.binding_id,
        agentType: b.agent_type,
        label,
      })
    }
  }

  if (slackRes.status === 'fulfilled' && slackRes.value.ok) {
    const data = await slackRes.value.json().catch(() => null)
    for (const i of data?.installations ?? []) {
      out.push({
        kind: 'slack',
        id: i.team_id,
        agentType: i.agent_type,
        label: i.team_name || 'Slack workspace',
      })
    }
  }

  if (apiRes.status === 'fulfilled' && apiRes.value.ok) {
    const data = await apiRes.value.json().catch(() => null)
    for (const k of data?.keys ?? []) {
      if (k.status !== 'active') continue
      out.push({
        kind: 'api',
        id: k.id,
        agentType: k.agent_type,
        label: k.label ? `${k.label} (${k.key_prefix}…)` : `API key (${k.key_prefix}…)`,
      })
    }
  }

  return out
}

export async function deleteDeployment(d: AgentDeployment): Promise<void> {
  const url =
    d.kind === 'telegram'
      ? `${BACKEND_URL}/api/v1/telegram/bindings/${encodeURIComponent(d.id)}`
      : d.kind === 'slack'
        ? `${BACKEND_URL}/api/v1/slack/installations/${encodeURIComponent(d.id)}`
        : `${BACKEND_URL}/api/v1/agent-api-keys/${encodeURIComponent(d.id)}`
  const res = await authedFetch(url, { method: 'DELETE' })
  if (!res.ok) {
    const detail = await res.json().then((x) => x?.detail).catch(() => null)
    throw new Error(detail || `Disconnect failed (${res.status})`)
  }
}
