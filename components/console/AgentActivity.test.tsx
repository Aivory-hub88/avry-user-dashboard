// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { AgentActivity } from './AgentActivity'
import type { ActivityStep } from '@/lib/agentActivity'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AgentActivity', () => {
  it('shows a ticking timer and the running step while the turn is live', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'))
    const start = Date.now()
    const steps: ActivityStep[] = [
      { id: 'a', label: 'crm lookup', status: 'done', startedAt: start, endedAt: start + 2000 },
      { id: 'b', label: 'send mail', status: 'running', startedAt: start + 2000 },
    ]
    render(<AgentActivity agentName="Lex" startedAt={start} steps={steps} />)
    expect(screen.getByText('Lex is working…')).toBeTruthy()
    expect(screen.getByText('crm lookup')).toBeTruthy()
    expect(screen.getByText('send mail')).toBeTruthy()
    expect(screen.getAllByText('0.0s').length).toBeGreaterThan(0)
    act(() => { vi.advanceTimersByTime(23_000) })
    expect(screen.getAllByText('23s').length).toBeGreaterThan(0)
  })

  it('says it is preparing before the first tool event', () => {
    render(<AgentActivity agentName="Lex" startedAt={Date.now()} steps={[]} />)
    expect(screen.getByText('Preparing a reply…')).toBeTruthy()
  })

  it('collapses to a summary once the turn has ended', () => {
    const steps: ActivityStep[] = [{ id: 'a', label: 'send mail', status: 'done', startedAt: 0, endedAt: 2000 }]
    render(<AgentActivity agentName="Lex" startedAt={0} steps={steps} endedAt={78_600} />)
    expect(screen.getByText(/Done in 1m 18s · 1 step/)).toBeTruthy()
    expect(screen.queryByText('Lex is working…')).toBeNull()
  })
})
