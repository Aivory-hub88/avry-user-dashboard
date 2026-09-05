/**
 * A tenant's agent's effective skill set — read-only, ADR-008 Phase 4.
 *
 * Backend: avry-backend /api/v1/agent-skills (JWT), which proxies Cerveau's
 * tenant-scoped GET /webhook/skills. Mirrors agentApprovals.ts's shape and
 * conventions.
 *
 * There is nothing here to create, edit, or delete — this is a listing, not
 * a management surface. Every skill this returns already exists because an
 * operator configured it; a tenant reads what their agent can do, they
 * don't shape it from the dashboard.
 */

import { authedFetch } from './deployAuth'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

export interface AgentSkill {
  name: string
  description: string
  /** Where this skill came from — informational, not actionable from here. */
  origin: 'workspace' | 'open-skills' | 'plugin' | 'bundle' | string
}

export async function listAgentSkills(agentType: string): Promise<AgentSkill[]> {
  const res = await authedFetch(
    `${BACKEND_URL}/api/v1/agent-skills?agent_type=${encodeURIComponent(agentType)}`,
  )
  if (!res.ok) throw new Error(`Failed to load skills (${res.status})`)
  const data = await res.json()
  return Array.isArray(data.skills) ? data.skills : []
}
