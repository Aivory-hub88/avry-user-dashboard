/**
 * Advisory LLM audit pass for the blueprint planner's output.
 *
 * IMPORTANT — this is a VALIDATOR, not an executor: it never regenerates or
 * mutates the deterministically-built graph from blueprintPlanner.ts. That
 * graph already has verified branch/exception structure (Stage 8's
 * structural validator) and real n8n node types (nodeMapper.ts) — handing
 * graph construction itself to an LLM would reintroduce the hallucination
 * risk this whole fix exists to remove. This pass only asks a second,
 * semantic question a keyword classifier can't answer well: "does any step
 * here look like the wrong kind of node for what it's actually doing?" —
 * and surfaces the answer as a warning for a human to review.
 *
 * Reuses the same VPS Bridge / Copilot LLM the "Aivory Copilot" chat tab
 * already talks to (lib/workflows/bridgeCopilot.ts) rather than adding a
 * second LLM integration. Caveat: the actual system prompt for the
 * 'workflow_edit' entrypoint lives server-side on the VPS bridge and is not
 * under version control in this repo (see docs on the copilot chat prompt),
 * so this reads the response defensively and fails open on anything
 * unexpected — a blueprint must always still produce a workflow even when
 * this secondary pass is unavailable or misbehaves.
 */

import { callCopilotOperation } from './bridgeCopilot'
import type { PlannedWorkflow } from './blueprintPlanner'

export interface LlmValidationResult {
  /** false only when the call itself failed (network/config/timeout) —
   *  never false just because issues were found. */
  ok: boolean
  warnings: string[]
}

const NO_ISSUES_RE = /^ok\b.*no issues/i

/**
 * Ask the Copilot LLM to sanity-check the planner's node-type choices.
 * Fails open: any error, timeout, or unparseable response returns
 * `{ ok: false, warnings: [] }` rather than throwing — callers should treat
 * this as "skip the advisory pass", not as a validation failure.
 */
export async function llmValidatePlan(planned: PlannedWorkflow, title: string): Promise<LlmValidationResult> {
  if (planned.steps.length === 0) return { ok: true, warnings: [] }

  try {
    const summary = planned.steps
      .map((s, i) => `${i + 1}. [${s.type || 'action'} / tool: ${s.tool}] ${s.action}`)
      .join('\n')

    const editRequest =
      `AUDIT ONLY — do not redesign or regenerate this workflow. It was generated deterministically for ` +
      `"${title}". List, in plain text, any step whose node choice looks wrong for AI governance: an AI ` +
      `Agent used for a purely mechanical action (sending a message, creating a record, fetching data, ` +
      `booking a calendar slot), or a step that clearly needs semantic reasoning/judgement but has no AI ` +
      `step at all. If nothing looks wrong, reply with EXACTLY "OK — no issues found." and nothing else. ` +
      `Steps:\n${summary}`

    const result = await callCopilotOperation('edit', { edit_request: editRequest })
    const message = typeof result?.message === 'string' ? result.message.trim() : ''

    if (!message || NO_ISSUES_RE.test(message)) return { ok: true, warnings: [] }
    return { ok: true, warnings: [`LLM review: ${message.slice(0, 500)}`] }
  } catch (err) {
    console.warn('[blueprintLlmValidator] advisory pass unavailable, skipping:', (err as Error).message)
    return { ok: false, warnings: [] }
  }
}
