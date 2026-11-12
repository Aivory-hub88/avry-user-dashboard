import { describe, it, expect, vi, beforeEach } from 'vitest'

const gate = vi.fn()
const trial = vi.fn()
const processMessage = vi.fn()

vi.mock('@/lib/planGate', () => ({ requirePaidPlan: (...a: unknown[]) => gate(...a) }))
vi.mock('@/lib/featureUses', () => ({ chargeTrial: (...a: unknown[]) => trial(...a) }))
vi.mock('@/lib/workflows/copilotStateMachine', () => ({
  CopilotStateMachine: class {
    processMessage = processMessage
    continuePending = vi.fn()
  },
}))

import { POST } from './route'

const req = (body: Record<string, unknown>) =>
  ({ json: async () => body }) as never

const denied = (code: string, status: number) => ({
  ok: false,
  code,
  response: new Response(JSON.stringify({ code }), { status }),
})

beforeEach(() => {
  gate.mockReset()
  trial.mockReset()
  processMessage.mockReset()
  processMessage.mockResolvedValue({ stage: 'CLARIFYING', lastMessage: 'ok', conversationHistory: [] })
})

describe('copilot free session', () => {
  it('paying accounts never touch the free allowance', async () => {
    gate.mockResolvedValue({ ok: true })
    const res = await POST(req({ prompt: 'hi', sessionId: 's1' }))
    expect(res.status).toBe(200)
    expect(trial).not.toHaveBeenCalled()
  })

  it('a free account spends its one session, keyed to the session id', async () => {
    gate.mockResolvedValue(denied('UPGRADE_REQUIRED', 402))
    trial.mockResolvedValue(null)
    const res = await POST(req({ prompt: 'hi', sessionId: 'session_abc' }))
    expect(res.status).toBe(200)
    expect(trial).toHaveBeenCalledWith(expect.anything(), 'copilot', 'copilot:session_abc')
  })

  it('a used-up free session gets the 402 and no LLM call', async () => {
    gate.mockResolvedValue(denied('UPGRADE_REQUIRED', 402))
    trial.mockResolvedValue(new Response(JSON.stringify({ code: 'UPGRADE_REQUIRED' }), { status: 402 }))
    const res = await POST(req({ prompt: 'hi', sessionId: 'session_new' }))
    expect(res.status).toBe(402)
    expect(processMessage).not.toHaveBeenCalled()
  })

  it('caps the turns inside the one free session', async () => {
    gate.mockResolvedValue(denied('UPGRADE_REQUIRED', 402))
    trial.mockResolvedValue(null)
    let last = 200
    for (let i = 0; i < 13; i++) last = (await POST(req({ prompt: 'again', sessionId: 'session_cap' }))).status
    expect(last).toBe(402)
  })

  it('other denials pass straight through', async () => {
    gate.mockResolvedValue(denied('UNAUTHENTICATED', 401))
    expect((await POST(req({ prompt: 'hi' }))).status).toBe(401)
    expect(trial).not.toHaveBeenCalled()
  })
})
