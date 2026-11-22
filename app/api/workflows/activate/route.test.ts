import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/planGate', () => ({ requirePaidPlan: async () => ({ ok: true }) }))
vi.mock('@/lib/teamAccess', () => ({ requireModule: async () => null }))
vi.mock('@/lib/workflows/cogneeGraphLog', () => ({ logWorkflowDeployed: vi.fn() }))
vi.mock('@/lib/serverAuth', () => ({ getAuthUser: () => null }))

import { POST } from './route'

const req = (body: unknown) =>
  new Request('http://localhost/api/workflows/activate', { method: 'POST', body: JSON.stringify(body) }) as never

const body = {
  workflow_id: 'w1',
  workflow_data: { title: 'T' },
  n8n_instance_url: 'https://n8n.example.com',
  n8n_api_key: 'k',
}

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })
beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}) })

function mockN8n(activate: { ok: boolean; status: number; text: string }) {
  globalThis.fetch = vi.fn(async (url: string) => {
    if (String(url).endsWith('/api/v1/workflows')) return new Response(JSON.stringify({ id: 'n1' }), { status: 200 })
    return new Response(activate.text, { status: activate.status })
  }) as never
}

describe('POST /api/workflows/activate: activation result', () => {
  it('reports active:true when n8n activates the workflow', async () => {
    mockN8n({ ok: true, status: 200, text: '{}' })
    const data = await (await POST(req(body))).json()
    expect(data).toMatchObject({ success: true, n8n_workflow_id: 'n1', active: true })
    expect(data.activation_error).toBeUndefined()
  })

  it('reports active:false with n8n\'s reason when activation is refused (deploy still succeeded)', async () => {
    mockN8n({ ok: false, status: 400, text: '{"message":"Workflow has no node to start the workflow"}' })
    const data = await (await POST(req(body))).json()
    expect(data).toMatchObject({ success: true, n8n_workflow_id: 'n1', active: false })
    expect(data.activation_error).toContain('no node to start')
  })
})
