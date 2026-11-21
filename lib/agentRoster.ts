/**
 * Single source of truth for Aivory's five Cerveau agent personas: ids,
 * first names, titles. Everywhere else in this repo that used to hardcode
 * its own copy of this list (workspaceAccess, agentChat, workspaceDbModel,
 * telegramDeploy/discordDeploy's type unions, the agents page, workspace
 * assignee/sharing pickers, agent avatars) derives from here instead.
 *
 * The underlying id/name/title data comes from lib/agentRoster.generated.ts,
 * regenerated at build time from the live Aivory backend's own roster
 * (GET /api/v1/agent-roster, backend/avry-backend/app/routes/agent_roster.py
 * -- see scripts/generate-agent-roster.mjs). This file is the stable,
 * hand-maintained public API on top of that generated data: types, derived
 * lookup maps, and small dashboard-only additions (like `enterprise`) that
 * aren't part of Cerveau's own roster metadata and so can't come from the
 * generated file.
 *
 * No non-generated imports, no side effects: safe to use from both server
 * and client components.
 */

import { AGENT_ROSTER_RAW } from './agentRoster.generated'

export type AgentType = (typeof AGENT_ROSTER_RAW)[number]['type']

export const AGENT_TYPE_IDS: readonly AgentType[] = AGENT_ROSTER_RAW.map((a) => a.type)

export interface AgentRosterEntry {
  type: AgentType
  /** First name shown in the Console/rail — see docs/AGENT-NAMING (11 Sep 2026). */
  name: string
  title: string
  /** True only for Enterprise-only agents (kept for the existing lock/badge UI). */
  enterprise?: boolean
  /** Lowest plan that can use this agent; unset = every paid plan. The backend
   *  enforces it (avry-backend AGENT_MIN_TIER); this is for display only. */
  minTier?: AgentMinTier
}

// Dashboard-only tier gating — not part of Cerveau's own roster metadata,
// so it can't be generated from the backend endpoint. Update by hand if a
// new agent needs a minimum plan.
export type AgentMinTier = 'business' | 'enterprise'

// Must mirror AGENT_MIN_TIER in avry-backend (app/services/telegram_service.py).
const MIN_TIER_BY_AGENT: Partial<Record<AgentType, AgentMinTier>> = {
  office_assistant: 'enterprise',
  deep_researcher: 'business', // Nara
}

export const AGENT_ROSTER: readonly AgentRosterEntry[] = AGENT_ROSTER_RAW.map((a) => {
  const minTier = MIN_TIER_BY_AGENT[a.type]
  if (!minTier) return { ...a }
  return minTier === 'enterprise' ? { ...a, minTier, enterprise: true } : { ...a, minTier }
})

export const AGENT_NAMES: Record<AgentType, string> = Object.fromEntries(
  AGENT_ROSTER.map((a) => [a.type, a.name]),
) as Record<AgentType, string>

export const AGENT_TITLES: Record<AgentType, string> = Object.fromEntries(
  AGENT_ROSTER.map((a) => [a.type, a.title]),
) as Record<AgentType, string>

export function isAgentType(v: unknown): v is AgentType {
  return typeof v === 'string' && (AGENT_TYPE_IDS as readonly string[]).includes(v)
}
