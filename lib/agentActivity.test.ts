import { describe, it, expect } from 'vitest'
import { applyToolEvent, closeSteps, formatElapsed, toolShortName, type ActivityStep } from './agentActivity'

describe('agentActivity', () => {
  it('adds a running step once and closes it with its end time', () => {
    let steps: ActivityStep[] = []
    steps = applyToolEvent(steps, { id: 't1', name: 'avry_mail__send_mail', status: 'running' }, 1000)
    steps = applyToolEvent(steps, { id: 't1', name: 'avry_mail__send_mail', status: 'running' }, 1500)
    expect(steps).toEqual([{ id: 't1', label: 'send mail', status: 'running', startedAt: 1000 }])
    steps = applyToolEvent(steps, { id: 't1', name: 'avry_mail__send_mail', status: 'done' }, 3100)
    expect(steps).toEqual([{ id: 't1', label: 'send mail', status: 'done', startedAt: 1000, endedAt: 3100 }])
  })

  it('ignores a done frame for a step it never saw, and keeps only the latest 40', () => {
    expect(applyToolEvent([], { id: 'x', name: 'a', status: 'done' }, 1)).toEqual([])
    let steps: ActivityStep[] = []
    for (let i = 0; i < 45; i++) steps = applyToolEvent(steps, { id: `t${i}`, name: 'a', status: 'running' }, i)
    expect(steps).toHaveLength(40)
    expect(steps[0].id).toBe('t5')
  })

  it('closes steps left running when the turn ends', () => {
    const steps: ActivityStep[] = [
      { id: 'a', label: 'x', status: 'done', startedAt: 1, endedAt: 2 },
      { id: 'b', label: 'y', status: 'running', startedAt: 3 },
    ]
    expect(closeSteps(steps, 9)[1]).toEqual({ id: 'b', label: 'y', status: 'done', startedAt: 3, endedAt: 9 })
  })

  it('formats elapsed time', () => {
    expect(formatElapsed(800)).toBe('0.8s')
    expect(formatElapsed(23_400)).toBe('23s')
    expect(formatElapsed(65_000)).toBe('1m 05s')
    expect(formatElapsed(-5)).toBe('0.0s')
  })

  it('shortens internal tool names', () => {
    expect(toolShortName('composio__GMAIL-FETCH_EMAILS')).toBe('gmail fetch emails')
    expect(toolShortName('')).toBe('tool')
  })
})
