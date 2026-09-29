/**
 * Agent Teams (ADR-020): a named set of one user's agents, attachable to
 * channels. Agents in a Team discover and delegate only within it (isolated,
 * default). Backend: avry-backend /api/v1/teams (JWT).
 *
 * Named "Agent Teams" everywhere in this repo because "team" already means a
 * group of humans in the Workspace (lib/teams.ts).
 */

import { authedFetch } from './deployAuth'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

/** Channel kinds the backend can bind today (more land with later phases). */
export type AgentTeamChannelKind = 'workspace' | 'telegram'

export interface AgentTeamChannel {
  kind: AgentTeamChannelKind
  ref: string
}

export interface AgentTeam {
  id: string
  name: string
  isolated: boolean
  agent_types: string[]
  channels: AgentTeamChannel[]
}

async function failure(res: Response, fallback: string): Promise<Error> {
  const detail = await res.json().then((d) => d?.detail).catch(() => null)
  return new Error(typeof detail === 'string' ? detail : `${fallback} (${res.status})`)
}

async function call<T>(path: string, init: RequestInit | undefined, fallback: string): Promise<T> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/teams${path}`, init)
  if (!res.ok) throw await failure(res, fallback)
  return res.json() as Promise<T>
}

export async function listAgentTeams(): Promise<AgentTeam[]> {
  const data = await call<{ teams: AgentTeam[] }>('', undefined, 'Failed to load teams')
  return data.teams ?? []
}

export function createAgentTeam(input: { name: string; agent_types: string[]; isolated?: boolean }): Promise<AgentTeam> {
  return call<AgentTeam>('', { method: 'POST', body: JSON.stringify(input) }, 'Failed to create team')
}

export function updateAgentTeam(
  id: string,
  patch: { name?: string; agent_types?: string[]; isolated?: boolean },
): Promise<AgentTeam> {
  return call<AgentTeam>(`/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) }, 'Failed to update team')
}

export async function deleteAgentTeam(id: string): Promise<void> {
  await call<{ success: boolean }>(`/${encodeURIComponent(id)}`, { method: 'DELETE' }, 'Failed to delete team')
}

export function attachTeamChannel(id: string, channel: AgentTeamChannel): Promise<AgentTeam> {
  return call<AgentTeam>(
    `/${encodeURIComponent(id)}/channels`,
    { method: 'POST', body: JSON.stringify(channel) },
    'Failed to attach channel',
  )
}

export function detachTeamChannel(id: string, channel: AgentTeamChannel): Promise<AgentTeam> {
  return call<AgentTeam>(
    `/${encodeURIComponent(id)}/channels/${channel.kind}/${encodeURIComponent(channel.ref)}`,
    { method: 'DELETE' },
    'Failed to detach channel',
  )
}

/** Which channel refs are already bound to a team other than `exceptTeamId`. */
export function boundElsewhere(teams: AgentTeam[], exceptTeamId: string): Set<string> {
  const out = new Set<string>()
  for (const t of teams) {
    if (t.id === exceptTeamId) continue
    for (const c of t.channels) out.add(`${c.kind}:${c.ref}`)
  }
  return out
}

/**
 * Room mentions narrowed to a team: only its members are offered (and so only
 * they can be addressed). No team, or a team that is not isolated, leaves the
 * list untouched (all deployed agents).
 */
export function filterCandidatesByTeam<T extends { type: string }>(
  candidates: T[],
  team: Pick<AgentTeam, 'agent_types' | 'isolated'> | null | undefined,
): T[] {
  if (!team || !team.isolated) return candidates
  const members = new Set(team.agent_types)
  return candidates.filter((c) => members.has(c.type))
}
