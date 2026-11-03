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
