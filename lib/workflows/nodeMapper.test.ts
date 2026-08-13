/**
 * nodeMapper — the AI-governance fix: an unrecognized step must default to
 * a generic deterministic action, never silently to an AI Agent. Plus the
 * new calendar/humanReview/audit node types the blueprint planner relies on.
 */
import { describe, it, expect } from 'vitest'
import { detectNodeIntent, mapIntentToN8nNode, mapIntentToN8nNodes, type MapContext } from './nodeMapper'

const ctx: MapContext = { stepIndex: 0, aiNodeCount: 0, isLast: false }
const step = (action: string, tool = '') => ({ step: 1, action, tool, output: '' })

describe('detectNodeIntent — AI governance default', () => {
  it('defaults unrecognized text to a generic http action, NOT ai', () => {
    expect(detectNodeIntent('Do the thing with the widget')).toBe('http')
  })

  it('still resolves explicit reasoning signals to ai', () => {
    expect(detectNodeIntent('Analyse the report and summarise the findings')).toBe('ai')
    expect(detectNodeIntent('Memvalidasi kelengkapan data dan mengklasifikasikan jenis layanan')).toBe('ai')
  })

  it('does not default a mechanical action to ai just because text is unfamiliar', () => {
    // "Create customer account" — no email/messaging/http keyword, must not fall to ai.
    expect(detectNodeIntent('Create customer account')).not.toBe('ai')
  })
})

describe('detectNodeIntent — new intents', () => {
  it('detects human review / manual approval text (EN + ID)', () => {
    expect(detectNodeIntent('Escalate to a human reviewer for manual approval')).toBe('humanReview')
    expect(detectNodeIntent('Meninjau kasus yang memerlukan persetujuan manual')).toBe('humanReview')
    expect(detectNodeIntent('Any action', 'Human Review')).toBe('humanReview')
  })

  it('detects calendar/session scheduling distinct from cron scheduling', () => {
    expect(detectNodeIntent('Schedule an introduction session with the customer')).toBe('calendar')
    expect(detectNodeIntent('Menjadwalkan sesi pengenalan')).toBe('calendar')
    // Recurring/cron scheduling stays a distinct intent.
    expect(detectNodeIntent('Run this report daily at 9am')).toBe('schedule')
  })

  it('detects CRM-related retrieval text bilingually', () => {
    expect(detectNodeIntent('Get customer data from the CRM')).toBe('http')
    expect(detectNodeIntent('Mengambil data pelanggan dari sistem CRM')).toBe('http')
  })

  it('detects native HubSpot and Zendesk integration names', () => {
    expect(detectNodeIntent('Get customer record', 'HubSpot')).toBe('hubspot')
    expect(detectNodeIntent('Create support ticket', 'Zendesk')).toBe('zendesk')
  })

  it('detects audit/log phrasing', () => {
    expect(detectNodeIntent('Write an audit trail entry for this action')).toBe('audit')
  })
})

describe('mapIntentToN8nNode — new node builders', () => {
  it('builds a Wait node for humanReview', () => {
    const node = mapIntentToN8nNode('humanReview', step('Escalate for manual review'), ctx)
    expect(node.type).toBe('n8n-nodes-base.wait')
    expect(node.parameters.resume).toBe('webhook')
  })

  it('builds a Google Calendar node for calendar', () => {
    const node = mapIntentToN8nNode('calendar', step('Schedule kickoff session'), ctx)
    expect(node.type).toBe('n8n-nodes-base.googleCalendar')
  })

  it('builds native credential-backed HubSpot, Zendesk, and Slack nodes', () => {
    const hubspot = mapIntentToN8nNode('hubspot', step('Get customer record', 'HubSpot'), ctx)
    const zendesk = mapIntentToN8nNode('zendesk', step('Create support ticket', 'Zendesk'), ctx)
    const slack = mapIntentToN8nNode('messaging', step('Notify team', 'Slack'), ctx)
    expect(hubspot.type).toBe('n8n-nodes-base.hubspot')
    expect(hubspot.credentials?.hubspotApi?.name).toBe('HubSpot account')
    expect(zendesk.type).toBe('n8n-nodes-base.zendesk')
    expect(zendesk.credentials?.zendeskApi?.name).toBe('Zendesk account')
    expect(slack.type).toBe('n8n-nodes-base.slack')
    expect(slack.credentials?.slackApi?.name).toBe('Slack account')
  })

  it('builds a Set node for audit', () => {
    const node = mapIntentToN8nNode('audit', step('Log the result'), ctx)
    expect(node.type).toBe('n8n-nodes-base.set')
  })

  it('humanReview/calendar/audit never expand into an AI Agent + Chat Model pair', () => {
    for (const intent of ['humanReview', 'calendar', 'audit'] as const) {
      const result = mapIntentToN8nNodes(intent, step('some action'), ctx)
      expect(result.primary.type).not.toContain('langchain')
      expect(result.extraNodes).toBeUndefined()
    }
  })
})

describe('mapIntentToN8nNodes — ai still expands into Agent + Chat Model', () => {
  it('builds an Agent node with a linked Chat Model sub-node', () => {
    const result = mapIntentToN8nNodes('ai', step('Classify the request'), ctx)
    expect(result.primary.type).toBe('@n8n/n8n-nodes-langchain.agent')
    expect(result.extraNodes?.length).toBe(1)
    expect(result.extraConnections?.[0].type).toBe('ai_languageModel')
  })
})
