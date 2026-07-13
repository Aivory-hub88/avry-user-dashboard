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
import type { TelegramAgentType } from './telegramDeploy'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

export interface PrebuiltAgent {
  type: TelegramAgentType
  title: string
  enterprise?: boolean
}

/** Must stay in sync with the AGENTS card list and backend AGENT_TYPES. */
export const PREBUILT_AGENTS: PrebuiltAgent[] = [
  { type: 'autonomous', title: 'Autonomous Agent' },
  { type: 'customer_service', title: 'Customer Service Agent' },
  { type: 'leads_qualifier', title: 'Leads Qualifier Agent' },
  { type: 'finance_invoice_ops', title: 'Finance & Invoice Ops Agent' },
  { type: 'office_assistant', title: 'Office Assistant', enterprise: true },
]

export async function sendAgentMessage(
  agentType: TelegramAgentType,
  text: string,
  conversationId?: string
): Promise<string> {
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
  return data.reply as string
}

export interface AgentDeployment {
  kind: 'telegram' | 'slack'
  /** binding_id (telegram) or team_id (slack) — used for disconnect */
  id: string
  agentType: string
  /** Chat title / workspace name shown to the user */
  label: string
}

export async function listDeployments(): Promise<AgentDeployment[]> {
  const [tgRes, slackRes] = await Promise.allSettled([
    authedFetch(`${BACKEND_URL}/api/v1/telegram/bindings`),
    authedFetch(`${BACKEND_URL}/api/v1/slack/installations`),
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

  return out
}

export async function deleteDeployment(d: AgentDeployment): Promise<void> {
  const url =
    d.kind === 'telegram'
      ? `${BACKEND_URL}/api/v1/telegram/bindings/${encodeURIComponent(d.id)}`
      : `${BACKEND_URL}/api/v1/slack/installations/${encodeURIComponent(d.id)}`
  const res = await authedFetch(url, { method: 'DELETE' })
  if (!res.ok) {
    const detail = await res.json().then((x) => x?.detail).catch(() => null)
    throw new Error(detail || `Disconnect failed (${res.status})`)
  }
}
