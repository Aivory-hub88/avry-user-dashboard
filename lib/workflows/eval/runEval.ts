/**
 * Workflow-builder eval runner (shared by the offline test and the live run).
 *
 *   plan (Aether's step tree) -> generatedWorkflowToN8n() -> scoreWorkflow()
 *
 * The conversion is the exact one the workflows page uses, so a score here is
 * what a user gets when they press "Apply to canvas".
 */
import fs from 'node:fs'
import path from 'node:path'
import { generatedWorkflowToN8n } from '@/lib/workflows/copilotToN8n'
import type { GeneratedWorkflow } from '@/lib/workflows/copilotStateMachine'
import { scoreWorkflow, type CaseExpectation, type CaseScore, type N8nWorkflowLike, type NodeCatalog } from './scorer'

export interface EvalCase {
  id: string
  lang: 'en' | 'id'
  tags: string[]
  prompt: string
  /** Reference plan — what a good generation step should output for this prompt. */
  plan: GeneratedWorkflow['steps']
  expect: CaseExpectation
  /** Known gap: why this case is expected to fail today. A fix flips it to passing and the ratchet asks to remove this. */
  knownIssue?: string
}

const DIR = path.join(process.cwd(), 'evals', 'workflow-builder')

export function loadCatalog(): NodeCatalog {
  return JSON.parse(fs.readFileSync(path.join(DIR, 'node-catalog.json'), 'utf8')) as NodeCatalog
}

export function loadCases(): EvalCase[] {
  return (JSON.parse(fs.readFileSync(path.join(DIR, 'cases.json'), 'utf8')) as { cases: EvalCase[] }).cases
}

export function toGeneratedWorkflow(name: string, steps: GeneratedWorkflow['steps']): GeneratedWorkflow {
  return { workflowName: name, steps, estimate_hours: 1, automation_score: 0.8, summary: '', nodeConfigs: [] }
}

export interface CaseResult {
  id: string
  lang: string
  tags: string[]
  prompt: string
  score: CaseScore
  n8n: N8nWorkflowLike
  knownIssue?: string
}

export function evaluatePlan(c: EvalCase, steps: GeneratedWorkflow['steps'], catalog: NodeCatalog): CaseResult {
  const n8n = generatedWorkflowToN8n(toGeneratedWorkflow(c.id, steps), { workflowId: `eval-${c.id}`, title: c.id }) as unknown as N8nWorkflowLike
  return { id: c.id, lang: c.lang, tags: c.tags, prompt: c.prompt, score: scoreWorkflow(n8n, c.expect, catalog), n8n, knownIssue: c.knownIssue }
}

export function summarize(results: CaseResult[]) {
  const passed = results.filter((r) => r.score.pass).length
  const avg = results.reduce((s, r) => s + r.score.score, 0) / (results.length || 1)
  const failedChecks: Record<string, number> = {}
  for (const r of results) for (const ch of r.score.checks) if (!ch.pass) failedChecks[ch.id] = (failedChecks[ch.id] || 0) + 1
  return { total: results.length, passed, passRate: passed / (results.length || 1), avgScore: avg, failedChecks }
}

export function formatReport(results: CaseResult[]): string {
  const s = summarize(results)
  const lines = [
    `workflow-builder eval: ${s.passed}/${s.total} cases pass (${(s.passRate * 100).toFixed(0)}%), avg score ${(s.avgScore * 100).toFixed(0)}%`,
    `failed checks: ${Object.entries(s.failedChecks).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(', ') || 'none'}`,
    '',
  ]
  for (const r of results) {
    const bad = r.score.checks.filter((c) => !c.pass)
    lines.push(`${r.score.pass ? 'PASS' : 'FAIL'} ${(r.score.score * 100).toFixed(0).padStart(3)}%  ${r.id}${r.knownIssue ? '  [known: ' + r.knownIssue + ']' : ''}`)
    for (const c of bad) lines.push(`      ${c.critical ? '✗' : '·'} ${c.id}: ${c.detail}`)
  }
  return lines.join('\n')
}
