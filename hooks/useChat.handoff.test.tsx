// @vitest-environment jsdom
/**
 * ADR-020 handoff in the Console Room: an agent's reply that @mentions a teammate
 * makes that teammate answer in its own bubble; chains are bounded.
 * The backend call is mocked; everything else is the real hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const { sendAgentMessage } = vi.hoisted(() => ({ sendAgentMessage: vi.fn() }))

vi.mock('@/lib/agentChat', async () => {
  const actual = await vi.importActual<typeof import('@/lib/agentChat')>('@/lib/agentChat')
  return { ...actual, sendAgentMessage }
})
vi.mock('@/lib/agentApprovals', () => ({ notifyApprovalsChanged: vi.fn() }))
vi.mock('@/contexts/ModeContext', () => ({ useMode: () => ({ agentTarget: null, setAgentTarget: vi.fn() }) }))
vi.mock('./useSession', () => ({
  useSession: () => ({ save: vi.fn(), load: vi.fn(() => []), delete: vi.fn() }),
}))
vi.mock('@/lib/auth', () => ({ getUser: () => ({ user_id: 'u1' }) }))

import { useChat } from './useChat'
import { candidateOf } from '@/lib/agentMentions'

const members = ['autonomous', 'customer_service', 'leads_qualifier'].map((t) => candidateOf(t)!)

function setup() {
  return renderHook(() =>
    useChat({
      attachments: [],
      clearAttachments: vi.fn(),
      processEvent: vi.fn(),
      resetAgentic: vi.fn(),
      triggerClassification: vi.fn(),
      addToast: vi.fn(),
      roomMembers: members,
    }),
  )
}

/** Script the backend: agent type -> list of replies it gives, in order. */
function script(replies: Record<string, string[]>) {
  const calls: { agent: string; payload: string }[] = []
  const used: Record<string, number> = {}
  sendAgentMessage.mockImplementation(async (agent: string, payload: string) => {
    calls.push({ agent, payload })
    const list = replies[agent] ?? ['ok']
    const i = used[agent] ?? 0
    used[agent] = i + 1
    return { reply: list[Math.min(i, list.length - 1)], pendingApproval: null }
  })
  return calls
}

const assistants = (messages: { role: string; agentType?: string | null; content: string }[]) =>
  messages.filter((m) => m.role === 'assistant').map((m) => `${m.agentType}:${m.content}`)

beforeEach(() => {
  sendAgentMessage.mockReset()
  // Node 25 ships its own (non-working) localStorage that shadows jsdom's.
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

describe('Room handoff', () => {
  it('a mentioned teammate answers in its OWN bubble, with the handoff in its payload', async () => {
    const calls = script({
      leads_qualifier: ['Datanya siap. @Teo tolong cek tiket Alvin.'],
      customer_service: ['Tiket Alvin sudah selesai.'],
    })
    const { result } = setup()
    await act(async () => {
      await result.current.handleSendRoom('@Lex siapkan laporan', [], ['leads_qualifier'])
    })
    expect(calls.map((c) => c.agent)).toEqual(['leads_qualifier', 'customer_service'])
    expect(calls[1].payload).toContain('<handoff from="Lex" hop="1" max="2">')
    expect(calls[1].payload).toContain('@Teo tolong cek tiket Alvin.')
    expect(assistants(result.current.messages)).toEqual([
      'leads_qualifier:Datanya siap. @Teo tolong cek tiket Alvin.',
      'customer_service:Tiket Alvin sudah selesai.',
    ])
  })

  it('does not hand off to someone outside the room, to itself, or on @all', async () => {
    const calls = script({ leads_qualifier: ['@Budi @Lex @all tolong'] })
    const { result } = setup()
    await act(async () => {
      await result.current.handleSendRoom('@Lex halo', [], ['leads_qualifier'])
    })
    expect(calls.map((c) => c.agent)).toEqual(['leads_qualifier'])
  })

  it('stops a ping-pong at the depth limit', async () => {
    const calls = script({
      leads_qualifier: ['@Teo bantu'],
      customer_service: ['@Lex balik lagi'],
      autonomous: ['@Teo lagi'],
    })
    const { result } = setup()
    await act(async () => {
      await result.current.handleSendRoom('@Lex mulai', [], ['leads_qualifier'])
    })
    // Lex (depth 0) -> Teo (1) -> Lex (2); depth 3 is not allowed, so Lex's second reply stops it.
    expect(calls.map((c) => c.agent)).toEqual(['leads_qualifier', 'customer_service', 'leads_qualifier'])
  })

  it('does not queue a teammate the human already addressed in the same round', async () => {
    const calls = script({ leads_qualifier: ['@Teo ikut ya'], customer_service: ['siap'] })
    const { result } = setup()
    await act(async () => {
      await result.current.handleSendRoom('@Lex @Teo halo', [], ['leads_qualifier', 'customer_service'])
    })
    expect(calls.map((c) => c.agent)).toEqual(['leads_qualifier', 'customer_service'])
  })

  it('a parked approval ends that branch (no handoff from it)', async () => {
    sendAgentMessage.mockResolvedValueOnce({
      reply: '@Teo tolong lanjutkan setelah disetujui',
      pendingApproval: { id: 'pa_1', tool_name: 'x', risk_tier: 'irreversible' },
    })
    const { result } = setup()
    await act(async () => {
      await result.current.handleSendRoom('@Lex hapus baris 3', [], ['leads_qualifier'])
    })
    expect(sendAgentMessage).toHaveBeenCalledTimes(1)
  })

  it('a roll call never hands off', async () => {
    const calls = script({ leads_qualifier: ['Halo! @Teo apa kabar'], customer_service: ['Halo'], autonomous: ['Halo'] })
    const { result } = setup()
    await act(async () => {
      await result.current.handleSendRoom('absen satu satu', [], ['leads_qualifier', 'customer_service', 'autonomous'], null, 'rollcall')
    })
    // Exactly the three the human asked, in order; the @Teo in Lex's greeting is ignored by the payload rule, not the queue.
    expect(calls.map((c) => c.agent)).toEqual(['leads_qualifier', 'customer_service', 'autonomous'])
    expect(calls[0].payload).toContain('Do not @mention anyone in this reply.')
  })
})
