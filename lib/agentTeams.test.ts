import { describe, it, expect, vi, beforeEach } from 'vitest'

const { authedFetch } = vi.hoisted(() => ({ authedFetch: vi.fn() }))
vi.mock('./deployAuth', () => ({ authedFetch }))

import {
  listAgentTeams,
  createAgentTeam,
  updateAgentTeam,
  deleteAgentTeam,
  attachTeamChannel,
  detachTeamChannel,
  boundElsewhere,
  type AgentTeam,
} from './agentTeams'

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const bad = (status: number, detail: string) => ({ ok: false, status, json: async () => ({ detail }) })

beforeEach(() => authedFetch.mockReset())

describe('agentTeams client', () => {
  it('lists teams', async () => {
    authedFetch.mockResolvedValue(ok({ teams: [{ id: 't1' }] }))
    expect(await listAgentTeams()).toEqual([{ id: 't1' }])
    expect(authedFetch.mock.calls[0][0]).toMatch(/\/api\/v1\/teams$/)
  })

  it('creates with a JSON body', async () => {
    authedFetch.mockResolvedValue(ok({ id: 't1' }))
    await createAgentTeam({ name: 'Sales', agent_types: ['leads_qualifier'] })
    const [, init] = authedFetch.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ name: 'Sales', agent_types: ['leads_qualifier'] })
  })

  it('updates and deletes by encoded id', async () => {
    authedFetch.mockResolvedValue(ok({ success: true }))
    await updateAgentTeam('team a/b', { isolated: false })
    expect(authedFetch.mock.calls[0][0]).toContain('/team%20a%2Fb')
    expect(authedFetch.mock.calls[0][1].method).toBe('PUT')
    await deleteAgentTeam('t1')
    expect(authedFetch.mock.calls[1][1].method).toBe('DELETE')
  })

  it('attaches and detaches a channel (ref encoded)', async () => {
    authedFetch.mockResolvedValue(ok({ id: 't1' }))
    await attachTeamChannel('t1', { kind: 'telegram', ref: '123_-456' })
    expect(authedFetch.mock.calls[0][0]).toMatch(/\/t1\/channels$/)
    await detachTeamChannel('t1', { kind: 'workspace', ref: 'room 1' })
    expect(authedFetch.mock.calls[1][0]).toMatch(/\/t1\/channels\/workspace\/room%201$/)
  })

  it('surfaces the backend detail on failure', async () => {
    authedFetch.mockResolvedValue(bad(403, 'That channel is not yours to attach'))
    await expect(attachTeamChannel('t1', { kind: 'workspace', ref: 'x' })).rejects.toThrow('not yours')
    authedFetch.mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('x') } })
    await expect(listAgentTeams()).rejects.toThrow('Failed to load teams (500)')
  })
})

describe('boundElsewhere', () => {
  const t = (id: string, channels: AgentTeam['channels']): AgentTeam => ({
    id, name: id, isolated: true, agent_types: [], channels,
  })
  it('collects channels bound to other teams only', () => {
    const teams = [
      t('a', [{ kind: 'workspace', ref: 'r1' }]),
      t('b', [{ kind: 'telegram', ref: 'x' }]),
    ]
    const set = boundElsewhere(teams, 'a')
    expect(set.has('telegram:x')).toBe(true)
    expect(set.has('workspace:r1')).toBe(false)
  })
})
