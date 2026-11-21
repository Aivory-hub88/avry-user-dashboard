/**
 * Departments (ADR-025 D1): a static, read-only grouping of the built-in roster.
 *
 * Aira (chief_of_staff) is the root. Each department has one leader (the incumbent agent of the domain);
 * Nara and Geno are shared services that report to Aira and can be called by any leader. Staff do not exist
 * yet (custom workers come later), so a department is just its leader for now. The same edges live in the
 * Cerveau config (`[[agents.X.delegates]]`), see ops/deploy/apply_departments_d1.py in the monorepo.
 *
 * Display only: nothing here grants or limits authority, and the structure is not editable in the UI.
 * No imports beyond the roster types, no side effects: safe on server and client.
 */
import type { AgentType } from './agentRoster'

export type DepartmentKey =
  | 'executive'
  | 'sales'
  | 'support'
  | 'finance'
  | 'marketing'
  | 'operations'
  | 'data'
  | 'admin'
  | 'shared'

export interface Department {
  key: DepartmentKey
  /** Leader (or, for `executive` and `shared`, the agents that sit there). */
  leader: AgentType | null
  members: readonly AgentType[]
}

/** Display order: the root first, leaders next, shared services last. */
export const DEPARTMENTS: readonly Department[] = [
  { key: 'executive', leader: 'chief_of_staff', members: ['chief_of_staff'] },
  { key: 'sales', leader: 'leads_qualifier', members: ['leads_qualifier'] },
  { key: 'support', leader: 'customer_service', members: ['customer_service'] },
  { key: 'finance', leader: 'finance_invoice_ops', members: ['finance_invoice_ops'] },
  { key: 'marketing', leader: 'marketing_content', members: ['marketing_content'] },
  { key: 'operations', leader: 'operations_inventory', members: ['operations_inventory'] },
  { key: 'data', leader: 'data_analyst', members: ['data_analyst'] },
  { key: 'admin', leader: 'office_assistant', members: ['office_assistant'] },
  { key: 'shared', leader: null, members: ['deep_researcher', 'autonomous'] },
]

export const DEPARTMENT_OF: Partial<Record<AgentType, DepartmentKey>> = Object.fromEntries(
  DEPARTMENTS.flatMap((d) => d.members.map((m) => [m, d.key])),
) as Partial<Record<AgentType, DepartmentKey>>

export interface DepartmentGroup<T> {
  key: DepartmentKey | 'other'
  /** Leader first, then the rest in department order. */
  items: T[]
}

/**
 * Group items (anything with an `agentType`) by department, in DEPARTMENTS order, leader first.
 * Items whose agentType is not in a department (custom or catalog agents) go to a trailing `other` group.
 * Empty groups are dropped, so a roster that lacks an agent never renders an empty section.
 */
export function groupByDepartment<T extends { agentType?: string }>(items: readonly T[]): DepartmentGroup<T>[] {
  const out: DepartmentGroup<T>[] = []
  const used = new Set<T>()
  for (const d of DEPARTMENTS) {
    const found: T[] = []
    for (const m of d.members) {
      const hit = items.find((i) => i.agentType === m)
      if (hit) {
        found.push(hit)
        used.add(hit)
      }
    }
    if (found.length) out.push({ key: d.key, items: found })
  }
  const rest = items.filter((i) => !used.has(i))
  if (rest.length) out.push({ key: 'other', items: rest })
  return out
}
