import { describe, it, expect, vi, beforeEach } from 'vitest'

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ query: queryMock }))

import { loadRoomRoster, refsOutsideRoster, unknownRoomPerson } from './workspaceRoomPeople'

const roster = { userIds: new Set(['u-1']), agentTypes: new Set(['autonomous']) }
const svc = { kind: 'service' } as never
const user = (id: string) => ({ kind: 'user', user: { user_id: id } }) as never

describe('refsOutsideRoster', () => {
  it('flags users and agents the room does not have, once each', () => {
    const out = refsOutsideRoster(
      [{ kind: 'user', id: 'u-1' }, { kind: 'user', id: 'u-x' }, { kind: 'user', id: 'u-x' }, { kind: 'agent', type: 'autonomous' }, { kind: 'agent', type: 'leads_qualifier' }],
      roster,
    )
    expect(out).toEqual([{ kind: 'user', id: 'u-x' }, { kind: 'agent', type: 'leads_qualifier' }])
  })
  it('lets the caller name themselves', () => {
    expect(refsOutsideRoster([{ kind: 'user', id: 'me' }], roster, 'me')).toEqual([])
  })
})

describe('loadRoomRoster / unknownRoomPerson', () => {
  beforeEach(() => {
    queryMock.mockReset()
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes('SELECT owner, workspace_id')) return Promise.resolve({ rows: [{ owner: 'u-own', workspace_id: 'team-1' }] })
      if (sql.includes('workspace_doc_acl')) return Promise.resolve({ rows: [{ user_id: 'u-acl' }] })
      if (sql.includes('workspace_members')) return Promise.resolve({ rows: [{ user_id: 'u-team' }] })
      if (sql.includes('workspace_agent_acl')) return Promise.resolve({ rows: [{ agent_type: 'autonomous' }] })
      return Promise.resolve({ rows: [] })
    })
  })

  it('collects owner, ACL grants, team members and invited agents', async () => {
    const r = await loadRoomRoster('doc-1')
    expect([...r.userIds].sort()).toEqual(['u-acl', 'u-own', 'u-team'])
    expect([...r.agentTypes]).toEqual(['autonomous'])
  })

  it('skips workspace members for the shared default workspace', async () => {
    queryMock.mockImplementation((sql: string) =>
      sql.includes('SELECT owner, workspace_id') ? Promise.resolve({ rows: [{ owner: 'u-own', workspace_id: 'default' }] }) : Promise.resolve({ rows: [] }),
    )
    await loadRoomRoster('doc-1')
    expect(queryMock.mock.calls.some((c) => String(c[0]).includes('workspace_members'))).toBe(false)
  })

  it('loads nothing when no one is added', async () => {
    expect(await unknownRoomPerson('doc-1', [], svc)).toBeNull()
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('returns the first stranger; the caller is always known', async () => {
    expect(await unknownRoomPerson('doc-1', [{ kind: 'user', id: 'u-team' }, { kind: 'user', id: 'nobody' }], svc)).toEqual({ kind: 'user', id: 'nobody' })
    expect(await unknownRoomPerson('doc-1', [{ kind: 'user', id: 'me' }], user('me'))).toBeNull()
  })
})
