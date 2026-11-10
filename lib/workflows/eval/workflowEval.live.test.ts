/**
 * Workflow-builder eval — LIVE layer (opt-in).
 *
 * Sends each case's prompt to the real vps-bridge `generate` operation (the
 * same call Aether makes), sanitizes and converts the model's plan exactly as
 * the app does, and scores it with the same scorer as the offline layer.
 * This measures the LLM + prompt; the offline layer measures the mapper.
 *
 *   ssh -N -L 3003:127.0.0.1:3003 aivory-prod &        # reach the bridge
 *   EVAL_LIVE=1 VPS_BRIDGE_URL=http://127.0.0.1:3003 \
 *     npx vitest run lib/workflows/eval/workflowEval.live.test.ts
 *
 * Optional: EVAL_CASES=id1,id2 (subset), EVAL_CONCURRENCY=3.
 * Costs LLM tokens (one generate call per case). Results are written to
 * evals/workflow-builder/results/ (gitignored) for before/after comparison.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { callCopilotOperation } from '@/lib/workflows/bridgeCopilot'
import { sanitizeWorkflow } from '@/lib/workflows/deterministicPlanner'
import { loadCases, loadCatalog, evaluatePlan, formatReport, summarize, type CaseResult } from './runEval'
import type { GeneratedWorkflow } from '@/lib/workflows/copilotStateMachine'

const live = !!process.env.EVAL_LIVE

describe.skipIf(!live)('workflow-builder eval (live: prompt -> bridge generate -> n8n)', () => {
  it('scores the real generator', async () => {
    const catalog = loadCatalog()
    const only = (process.env.EVAL_CASES || '').split(',').map((s) => s.trim()).filter(Boolean)
    const cases = loadCases().filter((c) => !only.length || only.includes(c.id))
    const concurrency = Math.max(1, Number(process.env.EVAL_CONCURRENCY || 3))

    const out: (CaseResult & { latencyMs: number; error?: string; generatedPlan?: unknown })[] = []
    let next = 0
    const worker = async () => {
      while (next < cases.length) {
        const c = cases[next++]
        const t0 = Date.now()
        try {
          const res = await callCopilotOperation('generate', {
            session_id: `eval-${c.id}`,
            organization_id: 'eval',
            user_request: c.prompt,
            conversation_history: [],
          })
          const wf = (res as { workflow?: GeneratedWorkflow }).workflow
          if (!wf || !Array.isArray(wf.steps) || wf.steps.length === 0) throw new Error('generator returned no steps')
          const steps = sanitizeWorkflow(wf.steps).steps
          out.push({ ...evaluatePlan(c, steps, catalog), latencyMs: Date.now() - t0, generatedPlan: steps })
        } catch (err) {
          // A failed generation is a failed case, not a crashed eval.
          const base = evaluatePlan(c, [], catalog)
          out.push({ ...base, score: { ...base.score, pass: false, score: 0 }, latencyMs: Date.now() - t0, error: err instanceof Error ? err.message : String(err) })
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker))
    out.sort((a, b) => a.id.localeCompare(b.id))

    const dir = path.join(process.cwd(), 'evals', 'workflow-builder', 'results')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `live-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    fs.writeFileSync(file, JSON.stringify({ summary: summarize(out), results: out.map(({ n8n, ...r }) => ({ ...r, n8n })) }, null, 1))

    console.log('\n' + formatReport(out))
    console.log(`\nerrors: ${out.filter((r) => r.error).length}, median latency: ${out.map((r) => r.latencyMs).sort((a, b) => a - b)[Math.floor(out.length / 2)]}ms\nresults: ${file}`)
    expect(out.length).toBe(cases.length)
  }, 30 * 60_000)
})
