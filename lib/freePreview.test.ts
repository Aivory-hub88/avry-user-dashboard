// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { lockedPrefixFor, LOCKED_PATH_PREFIXES, LOCKED_FEATURE_NAMES } from './freePreview'
import { handleUpgradeRequired, UPGRADE_EVENT } from './planAccess'

describe('free preview locks', () => {
  it('locks the paid modules and their sub-pages', () => {
    expect(lockedPrefixFor('/agents')).toBe('/agents')
    expect(lockedPrefixFor('/agents/teams')).toBe('/agents')
    expect(lockedPrefixFor('/blueprint')).toBe('/blueprint')
    expect(lockedPrefixFor('/integrations')).toBe('/integrations')
  })

  it('leaves the free parts open', () => {
    for (const p of ['/', '/overview', '/console', '/diagnostics', '/diagnostics/deep', '/workflows', '/dashboard/subscriptions']) {
      expect(lockedPrefixFor(p)).toBeNull()
    }
    expect(lockedPrefixFor('/agentsx')).toBeNull()
  })

  it('names every locked module', () => {
    for (const p of LOCKED_PATH_PREFIXES) expect(LOCKED_FEATURE_NAMES[p]).toBeTruthy()
  })
})

describe('handleUpgradeRequired', () => {
  it('opens the prompt only for a 402 UPGRADE_REQUIRED', () => {
    const seen = vi.fn()
    window.addEventListener(UPGRADE_EVENT, (e) => seen((e as CustomEvent).detail))
    expect(handleUpgradeRequired(402, { code: 'NO_RUNS_LEFT' })).toBe(false)
    expect(handleUpgradeRequired(403, { code: 'UPGRADE_REQUIRED' })).toBe(false)
    expect(handleUpgradeRequired(402, { code: 'UPGRADE_REQUIRED', message: 'Upgrade' }, 'AI Console')).toBe(true)
    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen.mock.calls[0][0]).toEqual({ feature: 'AI Console', message: 'Upgrade' })
  })
})
