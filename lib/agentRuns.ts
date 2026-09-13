/**
 * "Is this agent doing something right now" — reads the live markers
 * avry-backend's agent_run_tracker writes around every turn (Console chat,
 * Telegram, Slack) in telegram_service.py's _route_to_agent.
 *
 * Backend: avry-backend GET /api/v1/agent-runs/active (JWT).
 */

import { authedFetch } from './deployAuth'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

export interface ActiveAgentRun {
  agent_type: string
  /** ISO timestamp; may be missing on a malformed/legacy row. */
  started_at: string | null
  channel: string | null
}

export async function listActiveRuns(): Promise<ActiveAgentRun[]> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/agent-runs/active`)
  if (!res.ok) throw new Error(`Failed to load active runs (${res.status})`)
  const data = await res.json()
  return Array.isArray(data?.runs) ? data.runs : []
}
