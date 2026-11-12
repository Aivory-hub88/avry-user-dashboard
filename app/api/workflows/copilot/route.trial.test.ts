import { describe, it, expect, vi, beforeEach } from 'vitest'

const gate = vi.fn()
const trial = vi.fn()
const processMessage = vi.fn()

vi.mock('@/lib/planGate', () => ({ requirePaidPlan: (...a: unknown[]) => gate(...a) }))
vi.mock('@/lib/featureUses', () => ({ trialTurn: (...a: unknown[]) => trial(...a) }))
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
const upgrade = () => new Response(JSON.stringify({ code: 'UPGRADE_REQUIRED' }), { status: 402 })
const steps = () => trial.mock.calls.map((c) => c[1])

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

  it('a free turn is checked first and recorded after it worked, keyed to the session', async () => {
    gate.mockResolvedValue(denied('UPGRADE_REQUIRED', 402))
    trial.mockResolvedValue(null)
    const res = await POST(req({ prompt: 'hi', sessionId: 'session_abc' }))
    expect(res.status).toBe(200)
    expect(trial.mock.calls).toEqual([
      [expect.anything(), 'check', 'copilot', 'copilot:session_abc'],
      [expect.anything(), 'record', 'copilot', 'copilot:session_abc'],
    ])
  })

  it('a used-up allowance (or used-up turns) gets the 402 and no LLM call', async () => {
    gate.mockResolvedValue(denied('UPGRADE_REQUIRED', 402))
    trial.mockResolvedValue(upgrade())
    const res = await POST(req({ prompt: 'hi', sessionId: 'session_new' }))
    expect(res.status).toBe(402)
    expect(processMessage).not.toHaveBeenCalled()
    expect(steps()).toEqual(['check'])
  })

  it('an errored turn is not recorded, so it costs nothing', async () => {
    gate.mockResolvedValue(denied('UPGRADE_REQUIRED', 402))
    trial.mockResolvedValue(null)
    processMessage.mockResolvedValue({ stage: 'ERROR', lastMessage: 'LLM failed', conversationHistory: [] })
    expect((await POST(req({ prompt: 'hi', sessionId: 's_err' }))).status).toBe(200)
    expect(steps()).toEqual(['check'])
  })

  it('a thrown turn is not recorded either', async () => {
    gate.mockResolvedValue(denied('UPGRADE_REQUIRED', 402))
    trial.mockResolvedValue(null)
    processMessage.mockRejectedValue(new Error('upstream down'))
    expect((await POST(req({ prompt: 'hi', sessionId: 's_throw' }))).status).toBe(500)
    expect(steps()).toEqual(['check'])
  })

  it('withholds the result when recording is refused (two sessions raced for the last use)', async () => {
    gate.mockResolvedValue(denied('UPGRADE_REQUIRED', 402))
    trial.mockResolvedValueOnce(null).mockResolvedValueOnce(upgrade())
    const res = await POST(req({ prompt: 'hi', sessionId: 's_race' }))
    expect(res.status).toBe(402)
    expect(await res.text()).not.toContain('"currentState"')
  })

  it('other denials pass straight through', async () => {
    gate.mockResolvedValue(denied('UNAUTHENTICATED', 401))
    expect((await POST(req({ prompt: 'hi' }))).status).toBe(401)
    expect(trial).not.toHaveBeenCalled()
  })
})
