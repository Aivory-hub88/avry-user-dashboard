/**
 * The scorer is the eval's ruler — prove it catches each failure class
 * (and doesn't flag a correct workflow) before trusting any score from it.
 */
import { describe, it, expect } from 'vitest'
import { loadCatalog } from './runEval'
import { scoreWorkflow, type N8nWorkflowLike, type CaseExpectation } from './scorer'

const catalog = loadCatalog()
const B = 'n8n-nodes-base.'

const webhook = { name: 'Webhook', type: B + 'webhook', typeVersion: 2, parameters: { httpMethod: 'POST', path: 'x' } }
const slackOk = { name: 'Slack', type: B + 'slack', typeVersion: 2.3, parameters: { resource: 'message', operation: 'post', channelId: 'C1', text: 'hi' } }
const link = (a: string, b: string) => ({ [a]: { main: [[{ node: b, type: 'main', index: 0 }]] } })
const wf = (nodes: any[], connections: any): N8nWorkflowLike => ({ nodes, connections })
const exp = (e: Partial<CaseExpectation> = {}): CaseExpectation => ({ trigger: 'webhook', ...e })
const failed = (w: N8nWorkflowLike, e: CaseExpectation) => scoreWorkflow(w, e, catalog).checks.filter((c) => !c.pass).map((c) => c.id)

describe('scoreWorkflow', () => {
  it('passes a correct workflow with no failed checks', () => {
    const s = scoreWorkflow(wf([webhook, slackOk], link('Webhook', 'Slack')), exp({ nodeTypes: [B + 'slack'] }), catalog)
    expect(s.pass).toBe(true)
    expect(s.score).toBe(1)
    expect(s.needsCredentials).toContain('slackApi')
  })

  it('flags a hallucinated node type', () => {
    const w = wf([webhook, { name: 'X', type: B + 'fooBar', typeVersion: 1, parameters: {} }], link('Webhook', 'X'))
    expect(failed(w, exp())).toContain('node-types-exist')
  })

  it('flags a typeVersion that does not exist (openAi 1.3)', () => {
    const w = wf([webhook, { name: 'AI', type: B + 'openAi', typeVersion: 1.3, parameters: {} }], link('Webhook', 'AI'))
    expect(failed(w, exp())).toContain('type-version-valid')
  })

  it('flags nodes n8n 2.x disables by default', () => {
    const w = wf([webhook, { name: 'Run', type: B + 'executeCommand', typeVersion: 1, parameters: { command: 'ls' } }], link('Webhook', 'Run'))
    expect(failed(w, exp())).toContain('no-disabled-nodes')
  })

  it('flags an invalid operation and an invented parameter', () => {
    const bad = { ...slackOk, parameters: { resource: 'message', operation: 'send', channel: '#general' } }
    const f = failed(wf([webhook, bad], link('Webhook', 'Slack')), exp())
    expect(f).toContain('resource-operation-valid')
    expect(f).toContain('params-known')
  })

  it('flags an unreachable node and a dangling connection', () => {
    const orphan = { name: 'Orphan', type: B + 'set', typeVersion: 3.4, parameters: {} }
    expect(failed(wf([webhook, slackOk, orphan], link('Webhook', 'Slack')), exp())).toContain('all-nodes-reachable')
    expect(failed(wf([webhook, slackOk], link('Webhook', 'Missing')), exp())).toContain('connections-valid')
  })

  it('requires exactly one trigger of the requested kind', () => {
    const cron = { name: 'Cron', type: B + 'scheduleTrigger', typeVersion: 1.2, parameters: {} }
    const two = wf([webhook, cron, slackOk], { ...link('Webhook', 'Slack'), ...link('Cron', 'Slack') })
    expect(failed(two, exp())).toContain('single-trigger')
    expect(failed(wf([cron, slackOk], link('Cron', 'Slack')), exp({ trigger: 'webhook' }))).toContain('trigger-kind')
    expect(failed(wf([cron, slackOk], link('Cron', 'Slack')), exp({ trigger: 'schedule' }))).not.toContain('trigger-kind')
  })

  it('checks expected, any-of and forbidden nodes', () => {
    const w = wf([webhook, slackOk], link('Webhook', 'Slack'))
    expect(failed(w, exp({ nodeTypes: [B + 'telegram'] }))).toContain('expected-nodes')
    expect(failed(w, exp({ anyOf: [[B + 'gmail', B + 'emailSend']] }))).toContain('expected-any-of')
    expect(failed(w, exp({ forbidNodeTypes: [B + 'slack'] }))).toContain('forbidden-nodes')
    expect(failed(w, exp({ nodeTypes: [B + 'slack'], anyOf: [[B + 'slack']] }))).toEqual([])
  })

  it('treats leftovers as non-critical: placeholders and unbalanced expressions', () => {
    const http = { name: 'HTTP', type: B + 'httpRequest', typeVersion: 4.2, parameters: { method: 'POST', url: 'https://api.example.com/endpoint', jsonBody: '={{ $json.a }' } }
    const s = scoreWorkflow(wf([webhook, http], link('Webhook', 'HTTP')), exp(), catalog)
    expect(s.pass).toBe(true)
    expect(s.checks.filter((c) => !c.pass).map((c) => c.id).sort()).toEqual(['expressions-balanced', 'no-placeholders'])
    expect(s.score).toBeLessThan(1)
  })

  it('accepts an AI sub-node reachable through its agent', () => {
    const agent = { name: 'Agent', type: '@n8n/n8n-nodes-langchain.agent', typeVersion: 1.7, parameters: {} }
    const model = { name: 'Model', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', typeVersion: 1, parameters: {} }
    const w = wf([webhook, agent, model], { ...link('Webhook', 'Agent'), Model: { ai_languageModel: [[{ node: 'Agent', type: 'ai_languageModel', index: 0 }]] } })
    expect(failed(w, exp())).not.toContain('all-nodes-reachable')
  })

  it('requires a real branch when asked', () => {
    const iff = { name: 'If', type: B + 'if', typeVersion: 2.3, parameters: {} }
    const one = wf([webhook, iff, slackOk], { ...link('Webhook', 'If'), If: { main: [[{ node: 'Slack', type: 'main', index: 0 }], []] } })
    expect(failed(one, exp({ branches: true }))).toContain('branches')
    const two = wf([webhook, iff, slackOk, { ...slackOk, name: 'Slack2' }], {
      ...link('Webhook', 'If'),
      If: { main: [[{ node: 'Slack', type: 'main', index: 0 }], [{ node: 'Slack2', type: 'main', index: 0 }]] },
    })
    expect(failed(two, exp({ branches: true }))).not.toContain('branches')
  })
})
