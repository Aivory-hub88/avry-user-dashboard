import { describe, it, expect } from 'vitest'
import { loadCatalog } from './eval/runEval'
import { scoreWorkflow } from './eval/scorer'
import {
  APP_KEYS, TRIGGER_APP_KEYS, buildAppNode, buildTriggerForTest, inferVerb, normalizeApp,
  parseDuration, resolveTrigger, scheduleParameters,
} from './appNodes'

const catalog = loadCatalog()

/** One-node-after-trigger workflow so the scorer's catalog checks (version, resource, operation, params) apply. */
function check(type: string, typeVersion: number, parameters: Record<string, any>) {
  const wf = {
    nodes: [
      { name: 'T', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, parameters: {} },
      { name: 'N', type, typeVersion, parameters },
    ],
    connections: { T: { main: [[{ node: 'N', type: 'main', index: 0 }]] } },
  }
  return scoreWorkflow(wf, { trigger: 'manual' }, catalog).checks.filter((c) => !c.pass && c.critical)
}

describe('appNodes — every emitted node is valid in the n8n catalog', () => {
  const titles = ['Read data', 'Create a record', 'Update the record', 'Delete the record', 'Look up a deal', 'Create a company', 'Charge the payment', 'Wait for manager approval', 'Wait 3 hours']
  for (const key of APP_KEYS) {
    it(`${key}: all verbs build catalog-valid nodes`, () => {
      for (const title of titles) {
        const n = buildAppNode(key, { title })
        expect(n, `${key} / ${title}`).not.toBeNull()
        expect(check(n!.type, n!.typeVersion, n!.parameters), `${key} / ${title}`).toEqual([])
      }
    })
    it(`${key}: uses the newest typeVersion n8n has`, () => {
      const n = buildAppNode(key, { title: 'Create a record' })!
      const versions = catalog.nodes[n.type].versions
      expect(n.typeVersion).toBe(Math.max(...versions))
    })
  }
  for (const key of TRIGGER_APP_KEYS) {
    it(`trigger ${key}: valid in the catalog`, () => {
      for (const t of ['', 'new pull request', 'refund issued', 'new deal']) {
        const b = buildTriggerForTest(key, t)
        const wf = { nodes: [{ name: 'T', type: b.type, typeVersion: b.typeVersion, parameters: b.parameters }], connections: {} }
        const bad = scoreWorkflow(wf, { trigger: 'app' }, catalog).checks.filter((c) => !c.pass && c.critical)
        expect(bad, `${key} / ${t}`).toEqual([])
      }
    })
  }
})

describe('normalizeApp', () => {
  it.each([
    ['google_drive', 'googledrive'], ['Google Drive', 'googledrive'], ['googledrive', 'googledrive'],
    ['google sheets', 'googlesheets'], ['googlesheets', 'googlesheets'], ['Google-Sheets', 'googlesheets'],
    ['Slack', 'slack'], ['postgresql', 'postgres'], ['whatsapp', 'whatsapp'], ['OpenAI', 'openai'],
  ])('%s -> %s', (raw, key) => expect(normalizeApp(raw)).toBe(key))
  it.each(['default', '', undefined, 'n8n', 'some-unknown-thing'])('%s -> null', (raw) => expect(normalizeApp(raw as any)).toBeNull())
})

describe('resolveTrigger', () => {
  it.each([
    [{ app: 'schedule', title: 'Nightly Trigger' }, 'schedule'],
    [{ app: 'schedule', title: 'Daily 9 AM Trigger' }, 'schedule'],
    [{ app: 'webhook', title: 'Every time a form is submitted' }, 'webhook'],
    [{ app: 'manual', title: 'Click to run' }, 'manual'],
    [{ app: 'gmail', title: 'New email' }, 'app'],
    [{ app: 'stripe', title: 'Payment succeeded' }, 'app'],
    [{ app: 'default', title: 'Every Monday at 9am' }, 'schedule'],
    [{ app: 'default', title: 'Nightly run' }, 'schedule'],
    [{ app: 'linkedin', title: 'New connection' }, 'webhook'],
    [{ title: 'Incoming webhook' }, 'webhook'],
  ])('%j -> %s', (input, kind) => expect(resolveTrigger(input).kind).toBe(kind))
})

describe('scheduleParameters', () => {
  it('reads the cadence from the trigger text', () => {
    expect(scheduleParameters('Every 15 minutes').rule.interval[0]).toMatchObject({ field: 'minutes', minutesInterval: 15 })
    expect(scheduleParameters('Setiap 6 jam').rule.interval[0]).toMatchObject({ field: 'hours', hoursInterval: 6 })
    expect(scheduleParameters('Daily 9 AM Trigger').rule.interval[0]).toMatchObject({ field: 'days', triggerAtHour: 9 })
    expect(scheduleParameters('Every night at 2am').rule.interval[0]).toMatchObject({ field: 'days', triggerAtHour: 2 })
    expect(scheduleParameters('Every Monday at 9am').rule.interval[0]).toMatchObject({ field: 'weeks', triggerAtDay: [1], triggerAtHour: 9 })
    expect(scheduleParameters('Setiap hari jam 8 pagi').rule.interval[0]).toMatchObject({ field: 'days', triggerAtHour: 8 })
    expect(scheduleParameters('Every hour').rule.interval[0]).toMatchObject({ field: 'hours', hoursInterval: 1 })
  })
})

describe('parseDuration / inferVerb', () => {
  it('parses waits', () => {
    expect(parseDuration('Wait 2 days')).toEqual({ amount: 2, unit: 'days' })
    expect(parseDuration('Tunggu 3 jam')).toEqual({ amount: 3, unit: 'hours' })
    expect(parseDuration('Wait a bit')).toEqual({ amount: 1, unit: 'hours' })
  })
  it('first verb wins', () => {
    expect(inferVerb('Read customers from Google Sheets and email them')).toBe('read')
    expect(inferVerb('Append row to Google Sheets')).toBe('write')
    expect(inferVerb('Ambil data penjualan dari Postgres')).toBe('read')
    expect(inferVerb('Store order in Postgres')).toBe('write')
  })
})
