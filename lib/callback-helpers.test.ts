import { describe, expect, it } from 'vitest'
import { buildIntegrationsRedirect } from './callback-helpers'

describe('buildIntegrationsRedirect', () => {
  it('keeps the production dashboard base path', () => {
    expect(
      buildIntegrationsRedirect(
        { status: 'connected', app: 'gmail' },
        'https://aivory.uk/dashboard/integrations/callback',
      ),
    ).toBe('https://aivory.uk/dashboard/integrations?connected=gmail')
  })

  it('does not use an internal container origin supplied by the request', () => {
    expect(
      buildIntegrationsRedirect(
        { status: 'error', reason: 'unauthorized' },
        'https://aivory.uk/dashboard/integrations/callback',
      ),
    ).toBe('https://aivory.uk/dashboard/integrations?error=unauthorized')
  })
})
