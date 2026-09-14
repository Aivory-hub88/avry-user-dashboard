/**
 * Single source of truth for Aivory's five Cerveau agent personas: ids,
 * first names, titles. Everywhere else in this repo that used to hardcode
 * its own copy of this list (workspaceAccess, agentChat, workspaceDbModel,
 * telegramDeploy/discordDeploy's type unions, the agents page, workspace
 * assignee/sharing pickers, agent avatars) now derives from here instead.
 *
 * See docs/CERVEAU-ODOO-UI-WIDGET-PLAN.md for the cross-repo version of
 * this same drift problem -- the Python backend's GET /api/v1/agent-roster
 * is a separate, not-yet-unified copy; this file only reconciles the
 * dashboard's own internal duplication, not the backend's.
 *
 * No imports, no side effects: safe to use from both server and client
 * components.
 */

export const AGENT_TYPE_IDS = [
  'autonomous',
  'customer_service',
  'leads_qualifier',
  'finance_invoice_ops',
  'office_assistant',
] as const

export type AgentType = (typeof AGENT_TYPE_IDS)[number]

export interface AgentRosterEntry {
  type: AgentType
  /** First name shown in the Console/rail — see docs/AGENT-NAMING (11 Sep 2026). */
  name: string
  title: string
  enterprise?: boolean
}

export const AGENT_ROSTER: readonly AgentRosterEntry[] = [
  { type: 'autonomous', name: 'Geno', title: 'Generalist Agent' },
  { type: 'customer_service', name: 'Teo', title: 'Ticket Ops Agent' },
  { type: 'leads_qualifier', name: 'Lex', title: 'Leads Qualifier Agent' },
  { type: 'finance_invoice_ops', name: 'Finn', title: 'Finance & Invoice Ops Agent' },
  { type: 'office_assistant', name: 'Ofira', title: 'Office Assistant', enterprise: true },
]

export const AGENT_NAMES: Record<AgentType, string> = Object.fromEntries(
  AGENT_ROSTER.map((a) => [a.type, a.name]),
) as Record<AgentType, string>

export const AGENT_TITLES: Record<AgentType, string> = Object.fromEntries(
  AGENT_ROSTER.map((a) => [a.type, a.title]),
) as Record<AgentType, string>

export function isAgentType(v: unknown): v is AgentType {
  return typeof v === 'string' && (AGENT_TYPE_IDS as readonly string[]).includes(v)
}
