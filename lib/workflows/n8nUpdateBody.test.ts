import { describe, it, expect } from 'vitest'
import { toN8nUpdateBody } from './n8nClient'

describe('toN8nUpdateBody', () => {
  it('drops read-only fields n8n rejects on PUT', () => {
    const body = toN8nUpdateBody({
      id: 'abc', active: true, createdAt: 'x', updatedAt: 'y', versionId: 'v', tags: [], shared: [],
      name: 'wf', nodes: [{ id: '1' }], connections: {},
      settings: { executionOrder: 'v1', availableInMCP: true },
      pinData: {},
    })
    expect(Object.keys(body).sort()).toEqual(['connections', 'name', 'nodes', 'pinData', 'settings'])
    expect(body.settings).toEqual({ executionOrder: 'v1' })
  })
  it('always sends a settings object', () => {
    expect(toN8nUpdateBody({ name: 'a', nodes: [], connections: {} }).settings).toEqual({})
  })
})
