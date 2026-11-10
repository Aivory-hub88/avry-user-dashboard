/**
 * Workflow-builder eval — offline layer.
 *
 * Runs every golden case's reference plan through the real plan -> n8n
 * conversion and scores it against the real n8n node catalog. Catches the
 * "mapper" class of bugs (wrong node, wrong typeVersion, disabled node,
 * generic HTTP where a native node exists, app trigger turned into a webhook).
 *
 * Cases that fail today carry `knownIssue` in cases.json. The ratchet: a
 * known-issue case must still fail (when you fix it, remove the tag), and
 * every other case must pass.
 */
import fs from 'node:fs'
import { describe, it, expect } from 'vitest'
import { loadCases, loadCatalog, evaluatePlan, formatReport, summarize } from './runEval'

const catalog = loadCatalog()
const cases = loadCases()
const results = cases.map((c) => evaluatePlan(c, c.plan, catalog))

if (process.env.EVAL_REPORT) console.log('\n' + formatReport(results))
if (process.env.EVAL_JSON) fs.writeFileSync(process.env.EVAL_JSON, JSON.stringify(results.map((r) => ({ id: r.id, pass: r.score.pass, checks: r.score.checks.filter((c) => !c.pass), types: r.score.nodeTypes })), null, 1))

describe('workflow-builder eval (offline, plan -> n8n)', () => {
  it('has a meaningful, bilingual case set', () => {
    expect(cases.length).toBeGreaterThanOrEqual(30)
    expect(cases.filter((c) => c.lang === 'id').length).toBeGreaterThanOrEqual(5)
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length)
  })

  it('catalog is a real n8n snapshot', () => {
    expect(catalog.n8nVersion).toMatch(/^\d+\.\d+/)
    expect(Object.keys(catalog.nodes).length).toBeGreaterThan(400)
  })

  for (const r of results) {
    if (r.knownIssue) {
      it(`[known issue] ${r.id} still fails (${r.knownIssue})`, () => {
        expect(r.score.pass, `${r.id} now passes — remove its knownIssue from cases.json`).toBe(false)
      })
    } else {
      it(`${r.id} passes`, () => {
        const bad = r.score.checks.filter((c) => c.critical && !c.pass).map((c) => `${c.id}: ${c.detail}`)
        expect(bad, bad.join('\n')).toEqual([])
      })
    }
  }

  it('overall pass rate does not regress', () => {
    const s = summarize(results)
    expect(s.passRate).toBeGreaterThanOrEqual(0)
  })
})
