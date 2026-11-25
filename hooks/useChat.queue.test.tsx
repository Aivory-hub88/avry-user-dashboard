// @vitest-environment jsdom
/**
 * Room call queue: an @all style round runs together, replies are laid out by who answered
 * first, and a rate-limited agent is retried instead of surfacing as "unavailable".
 * The backend call is mocked; the governor and everything else is the real hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const { sendAgentMessage } = vi.hoisted(() => ({ sendAgentMessage: vi.fn() }))

vi.mock('@/lib/agentChat', async () => {
  const actual = await vi.importActual<typeof import('@/lib/agentChat')>('@/lib/agentChat')
  return { ...actual, sendAgentMessage }
})
vi.mock('@/lib/callGovernor', async () => {
  const actual = await vi.importActual<typeof import('@/lib/callGovernor')>('@/lib/callGovernor')
  return { ...actual, backoffMs: () => 0 }
})
vi.mock('@/lib/agentApprovals', () => ({ notifyApprovalsChanged: vi.fn() }))
vi.mock('@/contexts/ModeContext', () => ({ useMode: () => ({ agentTarget: null, setAgentTarget: vi.fn() }) }))
vi.mock('./useSession', () => ({
  useSession: () => ({ save: vi.fn(), load: vi.fn(() => []), delete: vi.fn() }),
}))
vi.mock('@/lib/auth', () => ({ getUser: () => ({ user_id: 'u1' }) }))

import { useChat } from './useChat'
import { candidateOf } from '@/lib/agentMentions'

const types = ['autonomous', 'customer_service', 'leads_qualifier']
const members = types.map((t) => candidateOf(t)!)

function setup(addToast = vi.fn()) {
  return renderHook(() =>
    useChat({
      attachments: [],
      clearAttachments: vi.fn(),
      processEvent: vi.fn(),
      resetAgentic: vi.fn(),
      triggerClassification: vi.fn(),
      addToast,
      roomMembers: members,
    }),
  )
}

const assistants = (messages: { role: string; agentType?: string | null; content: string }[]) =>
  messages.filter((m) => m.role === 'assistant').map((m) => `${m.agentType}:${m.content}`)

beforeEach(() => {
  sendAgentMessage.mockReset()
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  })
})

describe('Room call queue', () => {
  it('lays replies out by arrival: the fast agent reads first even though it is listed last', async () => {
    let releaseSlow!: () => void
    const slowGate = new Promise<void>((r) => (releaseSlow = r))
    sendAgentMessage.mockImplementation(async (agent: string) => {
      if (agent === 'autonomous') {
        await slowGate // only released once the fast agent has answered: also proves the round is parallel
        return { reply: 'lambat', pendingApproval: null }
      }
      if (agent === 'leads_qualifier') {
        setTimeout(releaseSlow, 0)
        return { reply: 'cepat', pendingApproval: null }
      }
      return { reply: 'sedang', pendingApproval: null }
    })
    const { result } = setup()
    await act(async () => {
      await result.current.handleSendRoom('apa kabar', [], types)
    })
    const order = assistants(result.current.messages)
    expect(order).toHaveLength(3)
    expect(order[order.length - 1]).toBe('autonomous:lambat')
    expect(order.indexOf('leads_qualifier:cepat')).toBeLessThan(order.indexOf('autonomous:lambat'))
  })

  it('retries a rate-limited agent instead of reporting it unavailable', async () => {
    let tries = 0
    sendAgentMessage.mockImplementation(async (agent: string) => {
      if (agent === 'leads_qualifier' && tries++ === 0) throw new Error('Agent chat failed (429)')
      return { reply: `ok ${agent}`, pendingApproval: null }
    })
    const toast = vi.fn()
    const { result } = setup(toast)
    await act(async () => {
      await result.current.handleSendRoom('apa kabar', [], types)
    })
    expect(tries).toBe(2)
    expect(assistants(result.current.messages)).toContain('leads_qualifier:ok leads_qualifier')
    expect(toast).not.toHaveBeenCalled()
  })

  it('gives up on a fatal error without retrying and keeps the other agents', async () => {
    sendAgentMessage.mockImplementation(async (agent: string) => {
      if (agent === 'leads_qualifier') throw new Error('Agent not deployed')
      return { reply: `ok ${agent}`, pendingApproval: null }
    })
    const toast = vi.fn()
    const { result } = setup(toast)
    await act(async () => {
      await result.current.handleSendRoom('apa kabar', [], types)
    })
    expect(sendAgentMessage.mock.calls.filter((c) => c[0] === 'leads_qualifier')).toHaveLength(1)
    expect(toast).toHaveBeenCalledTimes(1)
    expect(assistants(result.current.messages)).toHaveLength(2)
  })
})
