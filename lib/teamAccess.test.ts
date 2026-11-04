import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ query: vi.fn() }))
vi.mock('@/lib/serverAuth', () => ({ getAuthUser: vi.fn() }))

import { resolveTeamAccess } from './teamAccess'
import { isNavKeyAllowedForTeam, isPathAllowedForTeam, teamHomePath } from './moduleAccess'

describe('resolveTeamAccess', () => {
  it('own plan or no team = unrestricted', () => {
    expect(resolveTeamAccess(true, [{ role: 'viewer', modules: [] }]).restricted).toBe(false)
    expect(resolveTeamAccess(false, []).restricted).toBe(false)
  })
  it('planless member gets the union of their grants', () => {
    const a = resolveTeamAccess(false, [
      { role: 'editor', modules: ['console'] },
      { role: 'viewer', modules: null },
    ])
    expect(a.restricted).toBe(true)
    expect(a.modules.sort()).toEqual(['console', 'workspace'])
  })
  it('an empty grant locks everything', () => {
    expect(resolveTeamAccess(false, [{ role: 'editor', modules: [] }]).modules).toEqual([])
  })
})

describe('team nav and routes', () => {
  const granted = ['console', 'workflows']
  it('hides non-granted nav, keeps Overview, hides CRM', () => {
    expect(isNavKeyAllowedForTeam('console', granted)).toBe(true)
    expect(isNavKeyAllowedForTeam('agents', granted)).toBe(false)
    expect(isNavKeyAllowedForTeam('profile', granted)).toBe(true)
    expect(isNavKeyAllowedForTeam('crm', granted)).toBe(false)
  })
  it('blocks only ungranted module paths', () => {
    expect(isPathAllowedForTeam('/agents/teams', granted)).toBe(false)
    expect(isPathAllowedForTeam('/workflows/abc', granted)).toBe(true)
    expect(isPathAllowedForTeam('/', granted)).toBe(true)
    expect(isPathAllowedForTeam('/workspace', granted)).toBe(false)
  })
  it('home falls back to Overview when nothing is granted', () => {
    expect(teamHomePath(['workflows'])).toBe('/workflows')
    expect(teamHomePath([])).toBe('/overview')
  })
})

describe('requireModule', () => {
  it('403s a restricted member without the module, passes otherwise, fails open on DB errors', async () => {
    const { query } = await import('@/lib/db')
    const { getAuthUser } = await import('@/lib/serverAuth')
    const { requireModule } = await import('./teamAccess')
    const req = {} as never
    const q = vi.mocked(query)
    vi.mocked(getAuthUser).mockReturnValue({ user_id: 'u1', account_type: 'user' } as never)

    // no plan, editor grant = [console] only
    q.mockImplementation((async (sql: string) =>
      sql.includes('user_tiers') ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [{ role: 'editor', modules: ['console'] }] }) as never)
    expect(await requireModule(req, 'console')).toBeNull()
    const denied = await requireModule(req, 'workflows')
    expect(denied?.status).toBe(403)
    expect((await denied!.json()).code).toBe('MODULE_DISABLED')

    // own plan = never restricted
    q.mockImplementation((async (sql: string) =>
      sql.includes('user_tiers') ? { rowCount: 1, rows: [{}] } : { rowCount: 1, rows: [{ role: 'editor', modules: [] }] }) as never)
    expect(await requireModule(req, 'workflows')).toBeNull()

    q.mockRejectedValue(new Error('db down'))
    expect(await requireModule(req, 'workflows')).toBeNull()

    vi.mocked(getAuthUser).mockReturnValue(null)
    expect(await requireModule(req, 'workflows')).toBeNull()
  })
})
