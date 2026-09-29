import { describe, it, expect, vi, beforeEach } from 'vitest'

const { authedFetch } = vi.hoisted(() => ({ authedFetch: vi.fn() }))
vi.mock('./deployAuth', () => ({ authedFetch }))

import { sendAgentMessage } from './agentChat'

const reply = { ok: true, status: 200, json: async () => ({ reply: 'hi', pending_approval: null }) }
const sentBody = () => JSON.parse(authedFetch.mock.calls[0][1].body as string)

beforeEach(() => authedFetch.mockReset().mockResolvedValue(reply))

describe('sendAgentMessage team_id (ADR-020)', () => {
  it('sends team_id when a team is picked', async () => {
    await sendAgentMessage('leads_qualifier', 'hello', 'conv-1', undefined, 'team_abc')
    expect(sentBody()).toMatchObject({ agent_type: 'leads_qualifier', conversation_id: 'conv-1', team_id: 'team_abc' })
  })

  it('omits team_id for no team, null, or empty', async () => {
    await sendAgentMessage('autonomous', 'hello', 'c')
    expect(sentBody()).not.toHaveProperty('team_id')
    authedFetch.mockClear()
    await sendAgentMessage('autonomous', 'hello', 'c', undefined, null)
    expect(sentBody()).not.toHaveProperty('team_id')
  })
})
