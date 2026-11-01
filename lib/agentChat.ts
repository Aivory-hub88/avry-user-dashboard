/**
 * Deployable-agent access from the dashboard.
 *
 * - sendAgentMessage(): talk to a prebuilt agent from the AI Console
 *   (backend /api/v1/telegram/agent-chat, JWT). The agent may run tools before
 *   answering, so a reply can take 5-30s. Pass `onDelta` to receive the text as
 *   it is written (backend /agent-chat/stream, SSE); without it the call blocks
 *   until the whole reply is ready.
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
  conversationId?: string,
  signal?: AbortSignal,
  /** Agent Team this Room turn belongs to (ADR-020); omitted = all deployed agents. */
  teamId?: string | null,
  /** Called with the reply written so far, each time more text arrives. Enables streaming. */
  onDelta?: (replySoFar: string) => void,
): Promise<AgentChatResult> {
  const init: RequestInit = {
    method: 'POST',
    body: JSON.stringify({
      agent_type: agentType,
      text,
      conversation_id: conversationId,
      ...(teamId ? { team_id: teamId } : {}),
    }),
  }
  // AbortSignal survives authedFetch's init spread (and its 401 retry),
  // so user-initiated stop cancels the in-flight agent call.
  if (signal) init.signal = signal

  if (onDelta) {
    const res = await authedFetch(`${BACKEND_URL}/api/v1/telegram/agent-chat/stream`, init)
    // A backend that predates the streaming route answers 404/405: use the blocking route.
    if (res.ok && res.body) return readAgentStream(res.body, onDelta)
    if (res.status !== 404 && res.status !== 405) await throwAgentChatError(res)
  }

  const res = await authedFetch(`${BACKEND_URL}/api/v1/telegram/agent-chat`, init)
  if (!res.ok) await throwAgentChatError(res)
  const data = await res.json()
  return {
    reply: data.reply as string,
    pendingApproval: data.pending_approval ?? null,
  }
}

async function throwAgentChatError(res: Response): Promise<never> {
  const detail = await res.json().then((d) => d?.detail).catch(() => null)
  throw new Error(detail || `Agent chat failed (${res.status})`)
}

/** Frames of /agent-chat/stream: start, chunk (text delta), ping, done, error. */
async function readAgentStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (replySoFar: string) => void,
): Promise<AgentChatResult> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let reply = ''
  let pendingApproval: ConsolePendingApproval | null = null
  let finished = false
  let failure: string | null = null

  const handle = (line: string) => {
    if (!line.startsWith('data:')) return
    let frame: { type?: string; content?: unknown; pending_approval?: ConsolePendingApproval | null; message?: unknown }
    try {
      frame = JSON.parse(line.slice(5).trim())
    } catch {
      return
    }
    if (frame.type === 'chunk' && typeof frame.content === 'string' && frame.content) {
      reply += frame.content
      onDelta(reply)
    } else if (frame.type === 'done') {
      pendingApproval = frame.pending_approval ?? null
      finished = true
    } else if (frame.type === 'error') {
      failure = typeof frame.message === 'string' && frame.message ? frame.message : 'Agent request failed'
    }
  }

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf('\n')) >= 0) {
        handle(buffer.slice(0, nl).replace(/\r$/, ''))
        buffer = buffer.slice(nl + 1)
      }
    }
    handle(buffer)
  } finally {
    reader.releaseLock()
  }

  if (failure !== null || !finished) {
    const message = failure ?? 'Agent stream ended unexpectedly'
    // Nothing written yet: surface it as a failed turn. Otherwise keep what the user already read.
    if (!reply.trim()) throw new Error(message)
    reply += `\n\n⚠️ ${message}`
  }
  return { reply, pendingApproval }
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
