import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ query: vi.fn() }))
vi.mock('@/lib/serverAuth', () => ({ getAuthUser: vi.fn() }))

import { allows, canShareInto, resolveWorkflowAccess, type WorkflowActor } from './access'

const actor = (over: Partial<WorkflowActor> = {}): WorkflowActor => ({
  userId: 'u1',
  superadmin: false,
  memberships: new Map(),
  ...over,
})

describe('resolveWorkflowAccess', () => {
  it('creator owns it, including a superadmin\'s own', () => {
    expect(resolveWorkflowAccess({ owner: 'u1' }, actor())).toBe('owner')
    expect(resolveWorkflowAccess({ owner: 'su' }, actor({ userId: 'su', superadmin: true }))).toBe('owner')
  })

  it('another customer\'s workflow is invisible, even to the superadmin', () => {
    expect(resolveWorkflowAccess({ owner: 'u2' }, actor())).toBeNull()
    expect(resolveWorkflowAccess({ owner: 'u2' }, actor({ superadmin: true }))).toBeNull()
  })

  it('unowned legacy workflows belong to the superadmin, nobody else', () => {
    expect(resolveWorkflowAccess({ owner: undefined }, actor())).toBeNull()
    expect(resolveWorkflowAccess({ owner: null }, actor({ superadmin: true }))).toBe('owner')
  })

  it('team members get their team role, only with the Workflows feature', () => {
    const wf = { owner: 'u2', workspace_id: 'w1' }
    const mk = (role: string, modules: string[] | null) =>
      actor({ memberships: new Map([['w1', { role, modules }]]) })
    expect(resolveWorkflowAccess(wf, mk('editor', null))).toBe('editor')
    expect(resolveWorkflowAccess(wf, mk('viewer', ['workflows']))).toBe('viewer')
    expect(resolveWorkflowAccess(wf, mk('owner', null))).toBe('owner')
    expect(resolveWorkflowAccess(wf, mk('editor', ['console']))).toBeNull()
    expect(resolveWorkflowAccess({ owner: 'u2', workspace_id: 'w2' }, mk('editor', null))).toBeNull()
  })
})

describe('allows / canShareInto', () => {
  it('viewer reads, editor writes, only owner deletes', () => {
    expect(allows('viewer', 'read')).toBe(true)
    expect(allows('viewer', 'write')).toBe(false)
    expect(allows('editor', 'write')).toBe(true)
    expect(allows('editor', 'delete')).toBe(false)
    expect(allows('owner', 'delete')).toBe(true)
    expect(allows(null, 'read')).toBe(false)
  })

  it('sharing needs edit rights and the feature in that team', () => {
    const a = (role: string, modules: string[] | null) => actor({ memberships: new Map([['w1', { role, modules }]]) })
    expect(canShareInto(a('editor', null), 'w1')).toBe(true)
    expect(canShareInto(a('viewer', null), 'w1')).toBe(false)
    expect(canShareInto(a('editor', ['console']), 'w1')).toBe(false)
    expect(canShareInto(a('editor', null), 'other')).toBe(false)
  })
})

describe('team admin workflows', () => {
  const member = (role: string, modules: string[] | null = null) =>
    actor({ memberships: new Map([['w1', { role, modules, admins: ['boss'] }]]) })

  it('everything the team admin owns is readable by every member, read-only', () => {
    expect(resolveWorkflowAccess({ owner: 'boss' }, member('editor'))).toBe('viewer')
    expect(resolveWorkflowAccess({ owner: 'boss' }, member('viewer', ['workflows']))).toBe('viewer')
    // a viewer's default grant is Workspace only, so no Workflows until the admin enables it
    expect(resolveWorkflowAccess({ owner: 'boss' }, member('viewer'))).toBeNull()
  })

  it('needs the Workflows feature', () => {
    expect(resolveWorkflowAccess({ owner: 'boss' }, member('editor', ['console']))).toBeNull()
  })

  it('does not expose a fellow member\'s unshared workflows, or another team\'s admin', () => {
    expect(resolveWorkflowAccess({ owner: 'peer' }, member('editor'))).toBeNull()
    expect(resolveWorkflowAccess({ owner: 'other-boss' }, member('editor'))).toBeNull()
  })

  it('an explicit share still grants edit on top of the read-only default', () => {
    expect(resolveWorkflowAccess({ owner: 'boss', workspace_id: 'w1' }, member('editor'))).toBe('editor')
  })
})
