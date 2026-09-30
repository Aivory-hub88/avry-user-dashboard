import { describe, it, expect } from 'vitest'
import { collapseAccounts } from './integration-accounts'

const acc = (slug: string, status: string, createdAt: string, id = `${slug}-${createdAt}`) => ({
  id, status, createdAt, toolkit: { slug },
})

describe('collapseAccounts', () => {
  it('shows one row for five expired outlook attempts (the newest)', () => {
    const items = [1, 2, 3, 4, 5].map((d) => acc('outlook', 'EXPIRED', `2026-08-0${d}T00:00:00Z`))
    const out = collapseAccounts(items)
    expect(out).toHaveLength(1)
    expect(out[0].createdAt).toBe('2026-08-05T00:00:00Z')
  })

  it('hides stale rows once the toolkit has an active account', () => {
    const out = collapseAccounts([
      acc('zendesk', 'EXPIRED', '2026-07-01T00:00:00Z'),
      acc('zendesk', 'ACTIVE', '2026-08-01T00:00:00Z'),
      acc('zendesk', 'EXPIRED', '2026-07-05T00:00:00Z'),
    ])
    expect(out.map((a) => a.status)).toEqual(['ACTIVE'])
  })

  it('keeps several active accounts of the same toolkit', () => {
    const out = collapseAccounts([acc('slack', 'ACTIVE', '2026-08-01T00:00:00Z', 'a'), acc('slack', 'ACTIVE', '2026-08-02T00:00:00Z', 'b')])
    expect(out).toHaveLength(2)
  })

  it('keeps toolkits independent and preserves order', () => {
    const out = collapseAccounts([
      acc('googlesheets', 'ACTIVE', '2026-09-30T00:00:00Z'),
      acc('outlook', 'EXPIRED', '2026-08-01T00:00:00Z'),
      acc('gmail', 'EXPIRED', '2026-08-02T00:00:00Z'),
    ])
    expect(out.map((a) => a.toolkit.slug)).toEqual(['googlesheets', 'outlook', 'gmail'])
  })

  it('handles empty and slug-less input', () => {
    expect(collapseAccounts([])).toEqual([])
    expect(collapseAccounts([{ status: 'EXPIRED', createdAt: 'x' }])).toHaveLength(1)
  })
})
