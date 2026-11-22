import { describe, it, expect } from 'vitest'
import { getAetherStatus } from './aetherStatus'

const base = { stage: 'IDLE', loading: false, isStreamingReply: false, isTesting: false, canApply: false, isCompleted: false }

describe('getAetherStatus', () => {
  it('CLARIFYING while a request is in flight is busy', () => {
    const s = getAetherStatus({ ...base, stage: 'CLARIFYING', loading: true })
    expect(s).toMatchObject({ busy: true, ready: false, text: 'Understanding your request…' })
  })
  it('CLARIFYING after Aether asked its question is NOT a busy spinner', () => {
    const s = getAetherStatus({ ...base, stage: 'CLARIFYING' })
    expect(s.busy).toBe(false)
    expect(s.ready).toBe(true)
    expect(s.text).not.toMatch(/Understanding/)
  })
  it('still reports the working stages as busy', () => {
    expect(getAetherStatus({ ...base, stage: 'GENERATING' })).toMatchObject({ busy: true, text: 'Building workflow…' })
    expect(getAetherStatus({ ...base, stage: 'TESTING' }).busy).toBe(true)
  })
  it('keeps the idle / ready / completed states', () => {
    expect(getAetherStatus(base).text).toBe('Ask Aether')
    expect(getAetherStatus({ ...base, canApply: true }).ready).toBe(true)
    expect(getAetherStatus({ ...base, isCompleted: true }).text).toBe('Applied to canvas')
  })
})

import { getStageBadge } from './aetherStatus'
describe('getStageBadge', () => {
  it('CLARIFYING pulses only while working', () => {
    expect(getStageBadge('CLARIFYING', true)).toBe('Understanding your request…')
    expect(getStageBadge('CLARIFYING', false)).toBeNull()
  })
  it('working stages always badge; idle never', () => {
    expect(getStageBadge('GENERATING', false)).toBe('Building workflow…')
    expect(getStageBadge('IDLE', false)).toBeNull()
  })
})
