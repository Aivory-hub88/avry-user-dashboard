/**
 * Which user-dashboard modules a workspace member may use. The workspace
 * admin grants them per member (`dashboard.workspace_members.modules`); a
 * NULL grant falls back to the role default. Owners always have everything.
 *
 * Keys match the sidebar nav keys in lib/moduleAccess.ts, plus `workspace`.
 * Pure and server-safe so the Teams UI and the API routes share one list.
 */

export type TeamRole = 'owner' | 'editor' | 'viewer'

export const TEAM_MODULES = [
  { key: 'workspace', label: 'Workspace' },
  { key: 'console', label: 'AI Console' },
  { key: 'agents', label: 'AI Agents' },
  { key: 'workflows', label: 'Workflows' },
  { key: 'executionLogs', label: 'Execution logs' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'templates', label: 'Templates' },
  { key: 'diagnostics', label: 'Diagnostics' },
  { key: 'blueprint', label: 'Blueprint' },
  { key: 'roadmap', label: 'Roadmap' },
] as const

export type TeamModuleKey = (typeof TEAM_MODULES)[number]['key']

const ALL_KEYS: readonly string[] = TEAM_MODULES.map((m) => m.key)

/** Role default when the admin hasn't customised the member. */
export function defaultModulesFor(role: string): TeamModuleKey[] {
  if (role === 'viewer') return ['workspace']
  return TEAM_MODULES.map((m) => m.key)
}

/** Keep only known keys, de-duplicated, in nav order. Non-arrays yield null. */
export function normalizeModules(input: unknown): TeamModuleKey[] | null {
  if (!Array.isArray(input)) return null
  const wanted = new Set(input.filter((k): k is string => typeof k === 'string'))
  return ALL_KEYS.filter((k) => wanted.has(k)) as TeamModuleKey[]
}

/** The member's effective module list. */
export function effectiveModules(role: string, stored: string[] | null | undefined): TeamModuleKey[] {
  if (role === 'owner') return TEAM_MODULES.map((m) => m.key)
  return stored ? (normalizeModules(stored) ?? []) : defaultModulesFor(role)
}

export function memberCanUse(role: string, stored: string[] | null | undefined, key: string): boolean {
  return (effectiveModules(role, stored) as string[]).includes(key)
}
