/**
 * Live activity of one agent turn (tool steps + elapsed time), like the status line in a
 * terminal coding agent. Pure helpers so the UI stays thin and the rules are testable.
 */
import type { ToolProgress } from './agentChat'

export interface ActivityStep {
  id: string
  /** Short readable name, e.g. "send mail". */
  label: string
  status: 'running' | 'done'
  startedAt: number
  endedAt?: number
}

const MAX_STEPS = 40

/** "avry_mail__send_mail" -> "send mail". Tool names are internal, so keep them generic. */
export function toolShortName(name: string): string {
  return name.split('__').pop()!.replace(/[_-]+/g, ' ').trim().toLowerCase() || 'tool'
}

/** Fold one tool frame into the step list (returns a new array). */
export function applyToolEvent(steps: ActivityStep[], tool: ToolProgress, now: number): ActivityStep[] {
  const idx = tool.id ? steps.findIndex((s) => s.id === tool.id) : -1
  if (tool.status === 'running') {
    if (idx >= 0) return steps
    const next = [...steps, { id: tool.id || `${tool.name}-${now}`, label: toolShortName(tool.name), status: 'running' as const, startedAt: now }]
    return next.slice(-MAX_STEPS)
  }
  if (idx < 0) return steps
  return steps.map((s, i) => (i === idx ? { ...s, status: 'done' as const, endedAt: now } : s))
}

/** 800 -> "0.8s", 23400 -> "23s", 65000 -> "1m 05s". */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, ms)
  if (total < 10_000) return `${(total / 1000).toFixed(1)}s`
  const secs = Math.floor(total / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, '0')}s`
}

/** Steps still marked running when the turn ends were cut short; close them at `endedAt`. */
export function closeSteps(steps: ActivityStep[], endedAt: number): ActivityStep[] {
  return steps.map((s) => (s.status === 'running' ? { ...s, status: 'done' as const, endedAt } : s))
}
