/** Status shown on the Aether pill and the minimized chip. */
export interface AetherStatus {
  text: string
  /** Aether is working in the background. */
  busy: boolean
  /** Something is waiting for the user (a validated proposal, or a question). */
  ready: boolean
}

const STAGE_LABEL: Record<string, string> = {
  GENERATING: 'Building workflow…',
  TESTING: 'Testing workflow…',
  FIXING: 'Fixing automatically…',
  APPLYING: 'Applying to canvas…',
}

export function getAetherStatus(p: {
  stage: string; loading: boolean; isStreamingReply: boolean; isTesting: boolean
  canApply: boolean; isCompleted: boolean; canvasTarget?: object | null
}): AetherStatus {
  // CLARIFYING is not "working": the state machine stays in it after Aether has
  // asked its question and is waiting for the user's answer. Reporting it as a
  // busy "Understanding your request…" left an amber pulsing dot forever while
  // Aether was actually idle. It is only busy while a request is in flight.
  if (p.stage === 'CLARIFYING') {
    return p.loading || p.isStreamingReply
      ? { text: 'Understanding your request…', busy: true, ready: false }
      : { text: 'Aether has a question · Reply to continue', busy: false, ready: true }
  }
  if (STAGE_LABEL[p.stage]) return { text: STAGE_LABEL[p.stage], busy: true, ready: false }
  if (p.isTesting) return { text: 'Testing workflow…', busy: true, ready: false }
  if (p.loading || p.isStreamingReply) return { text: 'Thinking…', busy: true, ready: false }
  if (p.canApply) return { text: p.canvasTarget ? 'Changes ready · Update canvas' : 'Workflow ready · Apply', busy: false, ready: true }
  if (p.isCompleted) return { text: p.canvasTarget ? 'Canvas updated' : 'Applied to canvas', busy: false, ready: false }
  return { text: 'Ask Aether', busy: false, ready: false }
}

/**
 * Pulsing stage badge in the panel header. Null when nothing is in flight —
 * including CLARIFYING once Aether has asked and is waiting for the user.
 */
export function getStageBadge(stage: string, working: boolean): string | null {
  if (stage === 'CLARIFYING') return working ? 'Understanding your request…' : null
  return STAGE_LABEL[stage] ?? null
}
