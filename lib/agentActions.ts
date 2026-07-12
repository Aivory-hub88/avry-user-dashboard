/**
 * Agent action log client.
 *
 * Deployed agents record structured actions (leads, tickets, invoices,
 * escalations, workflow runs, integration calls) through their tools; this
 * reads them back for the dashboard activity feed.
 * Backend: avry-backend /api/v1/agent-actions (JWT).
 */

import { authedFetch } from './deployAuth'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

export type AgentActionType =
  | 'lead'
  | 'ticket'
  | 'escalation'
  | 'invoice'
  | 'anomaly'
  | 'workflow'
  | 'integration'

export interface AgentAction {
  action_id: string
  user_id: string
  agent_type: string
  action_type: AgentActionType
  payload: Record<string, unknown>
  session_id?: string | null
  channel?: string | null
  created_at: string
}

export async function listAgentActions(limit = 20): Promise<AgentAction[]> {
  const res = await authedFetch(
    `${BACKEND_URL}/api/v1/agent-actions?limit=${limit}`
  )
  if (!res.ok) throw new Error(`Failed to load agent activity (${res.status})`)
  const data = await res.json()
  return Array.isArray(data?.actions) ? data.actions : []
}
