/**
 * LLM semantic review — the "thinker" layer of the blueprint pipeline.
 *
 * The deterministic planner guarantees STRUCTURE (nodes connected, conditions
 * well-formed, schema valid) and n8n's sandbox guarantees EXECUTION (it runs
 * without error). Neither answers the SEMANTIC question: "is this the right
 * workflow for the business the blueprint describes?" — e.g. is escalation
 * actually conditional, does "based on X" resolve X first, is a deterministic
 * action wrongly routed through an AI Agent.
 *
 * This pass asks that question of the Copilot LLM and returns STRUCTURED
 * findings (severity + issue + suggestion), not a single free-text blob, so
 * the route can act on them (surface as a report, flag requiresConfiguration,
 * or drive an auto-fix pass) instead of just appending an opaque warning.
 *
 * It remains FAIL-OPEN: the blueprint must still produce a workflow even when
 * the LLM is unavailable or returns unparseable output. The deterministic
 * lint + schema validators stay the hard gates; this is the semantic gate that
 * degrades to "not semantically reviewed" rather than blocking the pipeline.
 */

import { callCopilotOperation } from './bridgeCopilot'
import type { PlannedWorkflow, PlannedStep } from './blueprintPlanner'

export interface SemanticFinding {
  severity: 'error' | 'warning'
  step?: number
  issue: string
  suggestion?: string
}

export interface LlmSemanticResult {
  /** false only when the call itself failed (network/config/timeout) — never
   *  false just because findings were returned. */
  ok: boolean
  findings: SemanticFinding[]
}

// ── Recursive graph summary ────────────────────────────────────────────────
// Flattening to "1. [action] Do X" loses the branch/condition structure that
// the semantic review exists to judge. This renders the graph as indented
// text so the LLM can see *what* each condition checks and *what each branch
// does*, which is exactly the layer a keyword classifier can't reason about.

function renderStep(s: PlannedStep, depth: number, index: number): string[] {
  const pad = '  '.repeat(depth)
  const n = `${pad}${index}. [${s.type || 'action'}${s.tool ? `/tool:${s.tool}` : ''}] ${s.action}`
  const lines: string[] = [n]
  if (s.conditionField) {
    lines.push(`${pad}   └─ condition field: $json.${s.conditionField}`)
  }
  if (s.assignments?.length) {
    lines.push(`${pad}   └─ sets: ${s.assignments.map((a) => a.name).join(', ')}`)
  }
  if (s.forceIntent === 'ai' && s.aiReasoning) {
    lines.push(`${pad}   └─ AI reasoning: ${s.aiReasoning.reason}`)
  }
  for (const [bi, b] of (s.branches ?? []).entries()) {
    lines.push(`${pad}   ├─ branch "${b.label ?? b.key}"${b.terminal ? ' (terminal)' : ''}:`)
    for (const [si, inner] of b.steps.entries()) {
      lines.push(...renderStep(inner, depth + 3, si + 1))
    }
  }
  return lines
}

function renderGraph(planned: PlannedWorkflow): string {
  return planned.steps.map((s, i) => renderStep(s, 0, i + 1).join('\n')).join('\n')
}

// ── Structured response parsing ────────────────────────────────────────────
// The bridge's workflow_edit prompt is server-side and may return prose even
// when asked for JSON. Parse defensively: prefer a JSON array, then a JSON
// object with `findings`, then fall back to a single prose finding.

function tryParseFindings(text: string): SemanticFinding[] | null {
  const trimmed = text.trim()
  // Strip a markdown code fence if present.
  const unFenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')

  for (const candidate of [unFenced, trimmed]) {
    try {
      const parsed = JSON.parse(candidate)
      if (Array.isArray(parsed)) {
        return parsed
          .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
          .map((f) => ({
            severity: f.severity === 'warning' ? 'warning' : 'error',
            ...(typeof f.step === 'number' ? { step: f.step } : {}),
            issue: typeof f.issue === 'string' ? f.issue : String(f.issue ?? ''),
            ...(typeof f.suggestion === 'string' && f.suggestion ? { suggestion: f.suggestion } : {}),
          }))
          .filter((f) => f.issue)
      }
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).findings)) {
        return (parsed as any).findings
          .filter((f: unknown): f is Record<string, unknown> => !!f && typeof f === 'object')
          .map((f: any) => ({
            severity: f.severity === 'warning' ? 'warning' : 'error',
            ...(typeof f.step === 'number' ? { step: f.step } : {}),
            issue: typeof f.issue === 'string' ? f.issue : String(f.issue ?? ''),
            ...(typeof f.suggestion === 'string' && f.suggestion ? { suggestion: f.suggestion } : {}),
          }))
          .filter((f: any) => f.issue)
      }
    } catch {
      /* not JSON — fall through to prose */
    }
  }
  return null
}

const NO_ISSUES_RE = /^ok\b|no issues|nothing (looks )?wrong|no findings|looks (correct|good|fine)/i

/**
 * Ask the Copilot LLM to review the planned workflow's SEMANTIC correctness
 * and return structured findings. Fails open — callers treat `ok: false` as
 * "skip the semantic pass", not as a validation failure.
 */
export async function llmSemanticReview(planned: PlannedWorkflow, title: string): Promise<LlmSemanticResult> {
  if (planned.steps.length === 0) return { ok: true, findings: [] }

  try {
    const graph = renderGraph(planned)

    const request =
      `You are the semantic reviewer for a deterministically-generated n8n workflow for "${title}". ` +
      `Judge SEMANTIC correctness (meaning), NOT structure: structure is already validated. ` +
      `Check for:\n` +
      `1. temporal verbs ("track"/"monitor") reduced to a single stateless action with no condition/wait\n` +
      `2. conditional verbs ("escalate delays"/"escalate overdue") that lost their IF condition\n` +
      `3. "based on X" where X is not resolved before the dependent action\n` +
      `4. "assign to relevant/responsible" with no mapping/lookup source\n` +
      `5. a condition/switch field that no upstream node produces\n` +
      `6. a deterministic CRUD action (create/send/schedule/update) routed through an AI Agent\n` +
      `7. a routing decision with no AI/classification source where the rule is not a simple lookup\n` +
      `8. invented SLA/time values the blueprint never stated\n\n` +
      `Reply with a JSON array of findings, each: {"severity":"error"|"warning","step":<number|null>,"issue":"...","suggestion":"..."}. ` +
      `If the workflow is semantically correct, reply with exactly: []\n\n` +
      `Workflow graph:\n${graph}`

    const result = await callCopilotOperation('semantic-review', { review_request: request })
    const message = typeof result?.message === 'string' ? result.message.trim() : ''

    if (!message) return { ok: true, findings: [] }
    if (NO_ISSUES_RE.test(message)) return { ok: true, findings: [] }

    const parsed = tryParseFindings(message)
    if (parsed) return { ok: true, findings: parsed }

    // Prose fallback — the LLM returned free text instead of JSON. Surface it
    // as a single warning so the signal isn't lost, but don't fail generation.
    return { ok: true, findings: [{ severity: 'warning', issue: message.slice(0, 500) }] }
  } catch (err) {
    console.warn('[blueprintLlmValidator] semantic review unavailable, skipping:', (err as Error).message)
    return { ok: false, findings: [] }
  }
}
