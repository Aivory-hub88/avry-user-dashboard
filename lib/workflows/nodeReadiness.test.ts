import { describe, it, expect } from 'vitest'
import {
  evaluateNodeReadiness, isNodeReady, summarizeWorkflowReadiness, describeTrigger, isEmptyValue,
} from './nodeReadiness'
import { getDeployChecklist, isDeployReady, extractConfigFromNode } from '@/components/workflow/inspector/nodeConfigUtils'

const rl = (value: string, mode = 'id') => ({ __rl: true, value, mode })
const node = (type: string, parameters: any = {}, credentials?: any, extra: any = {}) => ({
  title: 'Node', category: 'action' as const, ...extra, rawN8n: { type, parameters, credentials },
})

describe('evaluateNodeReadiness', () => {
  it('flags an empty credential slot', () => {
    const items = evaluateNodeReadiness(node('n8n-nodes-base.googleDrive', { resource: 'fileFolder', operation: 'search' },
      { googleDriveOAuth2Api: { id: '', name: 'Google Drive account' } }))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'credential', severity: 'error', app: 'Google Drive', message: 'Connect your Google Drive account' })
  })

  it('flags a node that needs a credential but has no slot at all', () => {
    const items = evaluateNodeReadiness(node('n8n-nodes-base.slack', { resource: 'message', operation: 'post', channelId: rl('general', 'name'), text: 'hi' }))
    expect(items.map(i => i.kind)).toEqual(['credential'])
  })

  it('accepts a connected credential', () => {
    const items = evaluateNodeReadiness(node('n8n-nodes-base.googleDrive', { operation: 'search' },
      { googleDriveOAuth2Api: { id: 'abc123', name: 'Drive' } }))
    expect(items).toEqual([])
  })

  it('treats a linked Aivory connection as connected', () => {
    const items = evaluateNodeReadiness(node('n8n-nodes-base.googleDrive', { operation: 'search' },
      { googleDriveOAuth2Api: { id: '', name: 'x' } }, { connectionId: 'conn-1' }))
    expect(items).toEqual([])
  })

  it('flags empty required parameters, including empty resource locators', () => {
    const items = evaluateNodeReadiness(node('n8n-nodes-base.googleSheets',
      { resource: 'sheet', operation: 'append', documentId: rl(''), sheetName: rl('Sheet1', 'name') },
      { googleSheetsOAuth2Api: { id: 'ok', name: 'Sheets' } }))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'required', field: 'documentId', message: 'Choose the spreadsheet' })
  })

  it('flags placeholder values', () => {
    const items = evaluateNodeReadiness(node('n8n-nodes-base.httpRequest', { url: 'https://api.example.com/UNRESOLVED_INTEGRATION' }))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'placeholder', field: 'url', severity: 'error' })
  })

  it('does not double-report an empty URL as placeholder', () => {
    const items = evaluateNodeReadiness(node('n8n-nodes-base.httpRequest', { url: '' }))
    expect(items.map(i => i.kind)).toEqual(['required'])
  })

  it('a fully configured Slack node is ready', () => {
    const n = node('n8n-nodes-base.slack', { resource: 'message', operation: 'post', channelId: rl('C123'), text: '={{ $json.msg }}' },
      { slackApi: { id: 's1', name: 'Slack' } })
    expect(evaluateNodeReadiness(n)).toEqual([])
    expect(isNodeReady(n)).toBe(true)
  })

  it('Gmail send needs recipient, subject and body; toList counts as recipient', () => {
    const creds = { gmailOAuth2: { id: 'g1', name: 'Gmail' } }
    const empty = evaluateNodeReadiness(node('n8n-nodes-base.gmail', { operation: 'send' }, creds))
    expect(empty.map(i => i.field)).toEqual(['sendTo', 'subject', 'message'])
    const ok = evaluateNodeReadiness(node('n8n-nodes-base.gmail', { operation: 'send', toList: ['a@b.co'], subject: 's', message: 'm' }, creds))
    expect(ok).toEqual([])
  })

  it('returns nothing for nodes without a raw n8n type', () => {
    expect(evaluateNodeReadiness({ title: 'x' })).toEqual([])
  })

  it('isEmptyValue', () => {
    expect(isEmptyValue('')).toBe(true)
    expect(isEmptyValue(rl(''))).toBe(true)
    expect(isEmptyValue(rl('x'))).toBe(false)
    expect(isEmptyValue(0)).toBe(false)
  })
})

describe('getDeployChecklist / isDeployReady', () => {
  const gdrive = node('n8n-nodes-base.googleDrive', { resource: 'fileFolder', operation: 'search' },
    { googleDriveOAuth2Api: { id: '', name: 'Google Drive account' } }, { title: 'List Google Drive Files', description: 'Lists files' })

  it('a Google Drive node without a credential is NOT ready', () => {
    const cfg = extractConfigFromNode(gdrive as any)
    expect(isDeployReady(cfg, gdrive as any)).toBe(false)
    expect(getDeployChecklist(cfg, gdrive as any).some(i => !i.ok && i.label.includes('Google Drive'))).toBe(true)
  })

  it('becomes ready once the credential is set', () => {
    const connected = node('n8n-nodes-base.googleDrive', { resource: 'fileFolder', operation: 'search' },
      { googleDriveOAuth2Api: { id: 'x', name: 'Drive' } }, { title: 'List Google Drive Files', description: 'Lists files' })
    expect(isDeployReady(extractConfigFromNode(connected as any), connected as any)).toBe(true)
  })

  it('Slack without credential is not ready; own channel check is not duplicated', () => {
    const slack = node('n8n-nodes-base.slack', { resource: 'message', operation: 'post', channelId: rl(''), text: 'x' },
      { slackApi: { id: '', name: 'Slack' } })
    const cfg = extractConfigFromNode(slack as any)
    const list = getDeployChecklist(cfg, slack as any)
    expect(list.filter(i => /channel/i.test(i.label))).toHaveLength(1)
    expect(isDeployReady(cfg, slack as any)).toBe(false)
  })

  it('Gmail with a connected credential and recipient is ready', () => {
    const g = node('n8n-nodes-base.gmail', { operation: 'send', sendTo: 'a@b.co', subject: 's', message: 'm' },
      { gmailOAuth2: { id: 'g', name: 'Gmail' } })
    expect(isDeployReady(extractConfigFromNode(g as any), g as any)).toBe(true)
  })

  it('keeps existing checks for nodes with no credential (schedule trigger)', () => {
    const s = node('n8n-nodes-base.scheduleTrigger', { rule: { interval: [{ field: 'hours', hoursInterval: 2 }] } }, undefined, { category: 'trigger' })
    expect(isDeployReady(extractConfigFromNode(s as any), s as any)).toBe(true)
  })
})

describe('summarizeWorkflowReadiness', () => {
  const nodes = [
    { id: 't', data: node('n8n-nodes-base.scheduleTrigger', { rule: { interval: [{ field: 'hours', hoursInterval: 6 }] } }, undefined, { category: 'trigger', title: 'Every 6 hours' }) },
    { id: 'd', data: node('n8n-nodes-base.googleDrive', { operation: 'search' }, { googleDriveOAuth2Api: { id: '', name: 'd' } }, { title: 'List Google Drive Files' }) },
    { id: 's', data: node('n8n-nodes-base.slack', { resource: 'message', operation: 'post', channelId: rl('C1'), text: 'hi' }, { slackApi: { id: '', name: 's' } }, { title: 'Post to Slack' }) },
    { id: 'c', data: node('n8n-nodes-base.code', { jsCode: 'return items' }, undefined, { title: 'Transform' }) },
  ]
  it('counts ready nodes, lists pending ones and groups connections by app', () => {
    const r = summarizeWorkflowReadiness(nodes)
    expect(r.total).toBe(4)
    expect(r.ready).toBe(2)
    expect(r.pending.map(p => p.id)).toEqual(['d', 's'])
    expect(r.connections.map(c => c.app)).toEqual(['Google Drive', 'Slack'])
    expect(r.trigger).toBe('Runs every 6 hours')
  })

  it('describes triggers in plain language', () => {
    expect(describeTrigger({ id: 'w', data: node('n8n-nodes-base.webhook', { path: 'new-lead' }) })).toBe('Starts when a request arrives at /new-lead')
    expect(describeTrigger({ id: 'm', data: node('n8n-nodes-base.manualTrigger') })).toBe('Starts when you run it manually')
    expect(describeTrigger({ id: 's', data: node('n8n-nodes-base.scheduleTrigger', { rule: { interval: [{ field: 'days', daysInterval: 1 }] } }) })).toBe('Runs every day')
  })
})
