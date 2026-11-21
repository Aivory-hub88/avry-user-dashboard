import { describe, expect, it } from 'vitest'
import { AGENT_TYPE_IDS } from './agentRoster'
import { DEPARTMENTS, DEPARTMENT_OF, groupByDepartment } from './departments'

describe('departments (ADR-025 D1)', () => {
  it('places every roster agent in exactly one department', () => {
    const seen = DEPARTMENTS.flatMap((d) => d.members)
    expect(new Set(seen).size).toBe(seen.length)
    for (const t of AGENT_TYPE_IDS) expect(DEPARTMENT_OF[t], t).toBeDefined()
  })

  it('has Aira as the root and Nara and Geno as shared services', () => {
    expect(DEPARTMENTS[0]).toMatchObject({ key: 'executive', leader: 'chief_of_staff' })
    expect(DEPARTMENT_OF.deep_researcher).toBe('shared')
    expect(DEPARTMENT_OF.autonomous).toBe('shared')
  })

  it('names the seven leaders from the ADR', () => {
    const leaders = DEPARTMENTS.filter((d) => d.key !== 'executive' && d.key !== 'shared').map((d) => d.leader)
    expect(leaders).toEqual([
      'leads_qualifier', 'customer_service', 'finance_invoice_ops', 'marketing_content',
      'operations_inventory', 'data_analyst', 'office_assistant',
    ])
  })

  it('groups in department order with the leader first and custom agents last', () => {
    const items = [
      { agentType: 'autonomous' }, { agentType: 'customer_service' }, { agentType: 'deep_researcher' },
      { agentType: 'chief_of_staff' }, { title: 'Custom' },
    ]
    const g = groupByDepartment(items)
    expect(g.map((x) => x.key)).toEqual(['executive', 'support', 'shared', 'other'])
    expect(g[2].items.map((i) => i.agentType)).toEqual(['deep_researcher', 'autonomous'])
    expect(g[3].items).toEqual([{ title: 'Custom' }])
  })

  it('drops empty departments', () => {
    expect(groupByDepartment([{ agentType: 'data_analyst' }]).map((x) => x.key)).toEqual(['data'])
    expect(groupByDepartment([])).toEqual([])
  })
})
