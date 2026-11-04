import { describe, it, expect } from 'vitest'
import { defaultModulesFor, effectiveModules, memberCanUse, normalizeModules } from './workspaceModules'

describe('workspace member modules', () => {
  it('owners always get everything, whatever is stored', () => {
    expect(memberCanUse('owner', [], 'console')).toBe(true)
    expect(effectiveModules('owner', ['workspace']).length).toBeGreaterThan(5)
  })

  it('NULL grant falls back to the role default', () => {
    expect(memberCanUse('editor', null, 'workflows')).toBe(true)
    expect(defaultModulesFor('viewer')).toEqual(['workspace'])
    expect(memberCanUse('viewer', null, 'console')).toBe(false)
  })

  it('an explicit grant wins over the role default', () => {
    expect(memberCanUse('editor', ['workspace', 'console'], 'workflows')).toBe(false)
    expect(memberCanUse('editor', ['workspace', 'console'], 'console')).toBe(true)
    expect(memberCanUse('editor', [], 'workspace')).toBe(false)
  })

  it('normalize drops unknown keys and duplicates, and rejects non-arrays', () => {
    expect(normalizeModules(['agents', 'agents', 'bogus', 42, 'console'])).toEqual(['console', 'agents'])
    expect(normalizeModules('console')).toBeNull()
    expect(normalizeModules(undefined)).toBeNull()
  })
})
