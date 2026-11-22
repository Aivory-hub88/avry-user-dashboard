import { describe, it, expect, vi, beforeEach } from 'vitest'

const { authedFetch } = vi.hoisted(() => ({ authedFetch: vi.fn() }))
vi.mock('./deployAuth', () => ({ authedFetch }))

import {
  getN8nMcpConnection,
  connectN8nMcp,
  reverifyN8nMcp,
  replaceN8nMcpToken,
  updateN8nMcpTools,
  updateN8nMcpAgents,
  disconnectN8nMcp,
  n8nMcpErrorKind,
  N8nMcpConnectionError,
} from './n8nMcpConnection'

const BASE = 'https://backend.aivory.id/api/v1/n8n-mcp-connection'
const conn = { url: 'https://n8n.example.com/mcp-server/http', status: 'verified', tools: [], enabled_tools: [] }
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const fail = (status: number, body: unknown) => ({ ok: false, status, json: async () => body })
const call = () => authedFetch.mock.calls[0] as [string, RequestInit | undefined]

beforeEach(() => authedFetch.mockReset())

describe('n8nMcpConnection client', () => {
  it('GET returns the connection and phase1 tools; null connection stays null', async () => {
    authedFetch.mockResolvedValue(ok({ connection: null, phase1_tools: ['search_workflows'] }))
    expect(await getN8nMcpConnection()).toEqual({ connection: null, phase1_tools: ['search_workflows'] })
    expect(call()[0]).toBe(BASE)
  })

  it('PUT connect sends url and token in the body, never in the URL', async () => {
    authedFetch.mockResolvedValue(ok(conn))
    await connectN8nMcp({ url: 'https://n8n.example.com/mcp-server/http', token: 'Bearer s3cret' })
    const [url, init] = call()
    expect(url).toBe(BASE)
    expect(url).not.toContain('s3cret')
    expect(init?.method).toBe('PUT')
    expect(JSON.parse(init?.body as string)).toEqual({
      url: 'https://n8n.example.com/mcp-server/http',
      token: 'Bearer s3cret',
    })
  })

  it('maps each route to the right method and path', async () => {
    authedFetch.mockResolvedValue(ok(conn))
    await reverifyN8nMcp()
    await replaceN8nMcpToken('t')
    await updateN8nMcpTools(['search_workflows'])
    await updateN8nMcpAgents(['autonomous'])
    const seen = authedFetch.mock.calls.map(([u, i]) => `${i?.method} ${u.replace(BASE, '')}`)
    expect(seen).toEqual(['POST /reverify', 'PUT /token', 'PUT /tools', 'PUT /agents'])
    expect(JSON.parse(authedFetch.mock.calls[2][1].body)).toEqual({ enabled_tools: ['search_workflows'] })
    expect(JSON.parse(authedFetch.mock.calls[3][1].body)).toEqual({ agent_types: ['autonomous'] })
  })

  it('DELETE resolves on 204 without parsing a body', async () => {
    authedFetch.mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error('no body') } })
    await expect(disconnectN8nMcp()).resolves.toBeUndefined()
    expect(call()[1]?.method).toBe('DELETE')
  })

  it('422 throws with reason and the saved connection attached', async () => {
    const saved = { ...conn, status: 'verification_failed' }
    authedFetch.mockResolvedValue(
      fail(422, { detail: { error: 'verification_failed', reason: 'Unauthorized (401)', connection: saved } }),
    )
    const err = await connectN8nMcp({ url: 'u', token: 't' }).catch((e) => e)
    expect(err).toBeInstanceOf(N8nMcpConnectionError)
    expect(err.status).toBe(422)
    expect(err.message).toBe('Unauthorized (401)')
    expect(err.connection).toEqual(saved)
  })

  it('string detail becomes the message; unparseable body falls back to the status', async () => {
    authedFetch.mockResolvedValueOnce(fail(402, { detail: 'No credits' }))
    expect(await reverifyN8nMcp().catch((e) => e)).toMatchObject({ status: 402, message: 'No credits' })
    authedFetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => { throw new Error('x') } })
    expect(await reverifyN8nMcp().catch((e) => e)).toMatchObject({ status: 503, message: 'Request failed (503)' })
  })

  it('maps statuses to message kinds', () => {
    const k = (s: number) => n8nMcpErrorKind(new N8nMcpConnectionError('x', s))
    expect([400, 402, 403, 404, 422, 429, 503, 500].map(k)).toEqual([
      'https', 'noCredit', 'forbidden', 'notFound', 'verification', 'rateLimited', 'unavailable', 'generic',
    ])
    expect(n8nMcpErrorKind(new Error('net'))).toBe('generic')
  })
})
