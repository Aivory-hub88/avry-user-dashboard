import { describe, it, expect } from 'vitest'
import { classifyN8nError } from './n8nClient'

const URL = 'https://n8n.example.com'

describe('classifyN8nError', () => {
  it('maps an n8n 404 to 404 WORKFLOW_NOT_FOUND', () => {
    const r = classifyN8nError(new Error('n8n get workflow failed (404): {"message":"not found"}'), URL)
    expect(r.status).toBe(404)
    expect(r.code).toBe('WORKFLOW_NOT_FOUND')
  })

  it('maps 401 and 403 to 401 INVALID_CREDENTIALS', () => {
    for (const code of ['401', '403']) {
      const r = classifyN8nError(new Error(`n8n get workflow failed (${code}): nope`), URL)
      expect(r.status).toBe(401)
      expect(r.code).toBe('INVALID_CREDENTIALS')
    }
  })

  it('maps a network TypeError to 502 INSTANCE_UNREACHABLE', () => {
    const r = classifyN8nError(new TypeError('fetch failed'), URL)
    expect(r.status).toBe(502)
    expect(r.code).toBe('INSTANCE_UNREACHABLE')
    expect(r.message).toContain(URL)
  })

  it('maps ECONNREFUSED causes to 502 INSTANCE_UNREACHABLE', () => {
    const err = Object.assign(new Error('x'), { cause: { code: 'ECONNREFUSED' } })
    expect(classifyN8nError(err, URL).code).toBe('INSTANCE_UNREACHABLE')
  })

  it('falls back to 502 DEPLOYMENT_FAILED for other errors', () => {
    const r = classifyN8nError(new Error('n8n update workflow failed (400): bad'), URL)
    expect(r.status).toBe(502)
    expect(r.code).toBe('DEPLOYMENT_FAILED')
    expect(classifyN8nError('weird', URL).code).toBe('DEPLOYMENT_FAILED')
  })
})
