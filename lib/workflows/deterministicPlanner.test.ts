import { describe, it, expect } from 'vitest'
import { analyzeRequest, matchTemplate, distinctAppCount } from './deterministicPlanner'

const MULTI_APP =
  'buat workflow baru: setiap lead baru masuk lewat webhook (nama, email, perusahaan), kirim email sambutan ke lead lewat Gmail, simpan datanya ke Google Sheets, lalu kabari tim sales di Slack channel #sales-leads'

describe('app detection uses whole words', () => {
  it('does not find WhatsApp inside "lewat" or other words containing "wa"', () => {
    const ids = analyzeRequest(MULTI_APP).detectedApps.map((a) => a.id)
    expect(ids).not.toContain('whatsapp')
    expect(ids).toEqual(expect.arrayContaining(['webhook', 'gmail', 'sheets', 'slack']))
  })

  it('still finds "wa" and "whatsapp" as standalone words', () => {
    expect(analyzeRequest('kirim notifikasi ke wa tim').detectedApps.map((a) => a.id)).toContain('whatsapp')
    expect(analyzeRequest('notify me on WhatsApp').detectedApps.map((a) => a.id)).toContain('whatsapp')
  })
})

describe('templates never squeeze a long flow', () => {
  it('a webhook → Gmail → Sheets → Slack request gets NO template (LLM builds it)', () => {
    const a = analyzeRequest(MULTI_APP)
    expect(distinctAppCount(a.detectedApps)).toBeGreaterThan(2)
    expect(matchTemplate(MULTI_APP, a)).toBeNull()
  })

  it('Gmail and the generic word "email" count as one app', () => {
    expect(distinctAppCount(analyzeRequest('when a ticket arrives send an email via Gmail').detectedApps)).toBe(1)
  })

  it('a simple two-app event → notification still uses the template', () => {
    const t = matchTemplate('when a new Zendesk ticket arrives, notify the team on Slack')
    expect(t?.templateId).toBe('event-notify')
    expect(t?.workflowName).toBe('Zendesk to Slack Notification')
  })
})
