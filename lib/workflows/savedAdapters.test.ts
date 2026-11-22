import { describe, it, expect } from 'vitest'
import { specToSaved, savedToSpec } from './savedAdapters'
import type { AivoryWorkflowSpec } from '@/types/workflow'

const spec = {
  id: 'wf-1', title: 'post (AI)', status: 'active', source: 'blueprint',
  company_name: 'Acme', trigger: 'manual', steps: [], integrations: [],
  estimated_time: '', automation_percentage: '', createdAt: '2026-11-22',
  n8n_workflow_id: '1XI6lVYVjqlSY94E', n8n_url: 'https://n8n.example/workflow/1',
  n8nWebhookPath: '/webhook/abc', n8n_instance: 'aivory',
} as unknown as AivoryWorkflowSpec

describe('saved/spec adapters keep the n8n instance hint', () => {
  it('specToSaved carries n8n_instance and webhook path (canvas needs ?instance=aivory)', () => {
    const saved = specToSaved(spec)
    expect(saved.n8n_instance).toBe('aivory')
    expect(saved.n8nWebhookPath).toBe('/webhook/abc')
  })
  it('savedToSpec round-trips them', () => {
    const back = savedToSpec(specToSaved(spec))
    expect(back.n8n_instance).toBe('aivory')
    expect(back.n8nWebhookPath).toBe('/webhook/abc')
  })
})
