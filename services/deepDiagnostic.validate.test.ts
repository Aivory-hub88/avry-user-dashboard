import { describe, it, expect } from 'vitest'
import { DeepDiagnosticService } from './deepDiagnostic'
import { DEEP_DIAGNOSTIC_PHASES } from '@/constants/deepDiagnosticQuestions'

const phaseWith = (id: string) => {
  const phase = DEEP_DIAGNOSTIC_PHASES.find(p => p.questions.some(q => q.id === id))!
  return phase
}

describe('validatePhase free-text answers', () => {
  it.each(['primary_objective', 'manual_processes', 'pain_points'])(
    '%s accepts a short answer (no minimum length)',
    id => {
      const phase = phaseWith(id)
      const responses: Record<string, any> = {}
      // fill every required question with something valid-ish except the text one under test
      for (const q of phase.questions) {
        if (!q.required) continue
        if (q.type === 'multiselect') responses[q.id] = [q.options?.[0] ?? 'x']
        else if (q.type === 'number') responses[q.id] = q.validation?.min ?? 1
        else if (q.options?.length) responses[q.id] = q.options[0]
        else responses[q.id] = 'ok'
      }
      responses[id] = 'sales outreach'
      expect(DeepDiagnosticService.validatePhase(phase, responses)[id]).toBeUndefined()
    },
  )

  it('still rejects empty and whitespace-only required answers', () => {
    const phase = phaseWith('manual_processes')
    expect(DeepDiagnosticService.validatePhase(phase, { manual_processes: '' }).manual_processes).toBe('This field is required')
    expect(DeepDiagnosticService.validatePhase(phase, { manual_processes: '     ' }).manual_processes).toBe('This field is required')
  })

  it('still enforces maxLength', () => {
    const phase = phaseWith('manual_processes')
    expect(DeepDiagnosticService.validatePhase(phase, { manual_processes: 'a'.repeat(1001) }).manual_processes).toMatch(/Maximum 1000/)
  })
})
