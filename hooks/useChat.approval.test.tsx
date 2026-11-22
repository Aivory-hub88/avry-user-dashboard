// @vitest-environment jsdom
/**
 * Deciding an approval from the chat bubble: resolves via the shared endpoint,
 * marks the card decided, appends the resumed reply, and reports a decision
 * that was already made elsewhere instead of failing silently.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const { sendAgentMessage, resolveApproval, notifyApprovalsChanged } = vi.hoisted(() => ({
  sendAgentMessage: vi.fn(),
  resolveApproval: vi.fn(),
  notifyApprovalsChanged: vi.fn(),
}))

vi.mock('@/lib/agentChat', async () => {
  const actual = await vi.importActual<typeof import('@/lib/agentChat')>('@/lib/agentChat')
  return { ...actual, sendAgentMessage }
})
vi.mock('@/lib/agentApprovals', async () => {
  const actual = await vi.importActual<typeof import('@/lib/agentApprovals')>('@/lib/agentApprovals')
  return { ...actual, resolveApproval, notifyApprovalsChanged }
})
vi.mock('@/contexts/ModeContext', () => ({ useMode: () => ({ agentTarget: 'autonomous', setAgentTarget: vi.fn() }) }))
vi.mock('./useSession', () => ({ useSession: () => ({ save: vi.fn(), load: vi.fn(() => []), delete: vi.fn() }) }))
vi.mock('@/lib/auth', () => ({ getUser: () => ({ user_id: 'u1' }) }))

import { useChat } from './useChat'
import { ApprovalResolveError } from '@/lib/agentApprovals'

function setup() {
  return renderHook(() =>
    useChat({
      attachments: [],
      clearAttachments: vi.fn(),
      processEvent: vi.fn(),
      resetAgentic: vi.fn(),
      triggerClassification: vi.fn(),
      addToast: vi.fn(),
    }),
  )
}

async function withParkedApproval() {
  sendAgentMessage.mockResolvedValue({
    reply: 'Perlu persetujuan untuk menjalankan workflow.',
    pendingApproval: { id: 'pa_1', tool_name: 'aivory-n8n__execute_workflow', risk_tier: 'reversible' },
  })
  const hook = setup()
  await act(async () => {
    await hook.result.current.handleSend('jalankan workflow', [])
  })
  const parked = hook.result.current.messages.find((m) => m.pendingApproval)!
  return { hook, parked }
}

beforeEach(() => {
  sendAgentMessage.mockReset()
  resolveApproval.mockReset()
  notifyApprovalsChanged.mockReset()
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

describe('decideApproval', () => {
  it('approve: resolves the parked id, marks the card approved, appends the resumed reply', async () => {
    resolveApproval.mockResolvedValue({ success: true, outcome: 'approved', reply: 'Workflow dijalankan, execution 42.' })
    const { hook, parked } = await withParkedApproval()
    await act(async () => {
      await hook.result.current.decideApproval(parked.id, 'approve')
    })
    expect(resolveApproval).toHaveBeenCalledWith({ id: 'pa_1', _agent_type: 'autonomous' }, 'approve')
    const after = hook.result.current.messages
    expect(after.find((m) => m.id === parked.id)).toMatchObject({ approvalOutcome: 'approved', approvalBusy: false })
    expect(after[after.length - 1]).toMatchObject({ role: 'assistant', content: 'Workflow dijalankan, execution 42.' })
    expect(notifyApprovalsChanged).toHaveBeenCalled()
  })

  it('deny: marks denied and adds no reply message', async () => {
    resolveApproval.mockResolvedValue({ success: true, outcome: 'denied', reply: 'ignored' })
    const { hook, parked } = await withParkedApproval()
    const before = hook.result.current.messages.length
    await act(async () => {
      await hook.result.current.decideApproval(parked.id, 'deny')
    })
    expect(hook.result.current.messages.find((m) => m.id === parked.id)?.approvalOutcome).toBe('denied')
    expect(hook.result.current.messages).toHaveLength(before)
  })

  it('a second click after deciding does nothing', async () => {
    resolveApproval.mockResolvedValue({ success: true, outcome: 'approved', reply: null })
    const { hook, parked } = await withParkedApproval()
    await act(async () => {
      await hook.result.current.decideApproval(parked.id, 'approve')
    })
    await act(async () => {
      await hook.result.current.decideApproval(parked.id, 'approve')
    })
    expect(resolveApproval).toHaveBeenCalledTimes(1)
  })

  it('404 means decided elsewhere: says so and stays undecided locally', async () => {
    resolveApproval.mockRejectedValue(new ApprovalResolveError(404))
    const { hook, parked } = await withParkedApproval()
    await act(async () => {
      await hook.result.current.decideApproval(parked.id, 'approve')
    })
    const m = hook.result.current.messages.find((x) => x.id === parked.id)!
    expect(m.approvalError).toMatch(/already decided/)
    expect(m.approvalOutcome).toBeFalsy()
    expect(m.approvalBusy).toBe(false)
  })

  it('a transient failure shows a retry message and allows trying again', async () => {
    resolveApproval.mockRejectedValueOnce(new ApprovalResolveError(502))
    const { hook, parked } = await withParkedApproval()
    await act(async () => {
      await hook.result.current.decideApproval(parked.id, 'approve')
    })
    expect(hook.result.current.messages.find((x) => x.id === parked.id)?.approvalError).toMatch(/Try again/)
    resolveApproval.mockResolvedValueOnce({ success: true, outcome: 'approved', reply: null })
    await act(async () => {
      await hook.result.current.decideApproval(parked.id, 'approve')
    })
    expect(hook.result.current.messages.find((x) => x.id === parked.id)?.approvalOutcome).toBe('approved')
  })
})
