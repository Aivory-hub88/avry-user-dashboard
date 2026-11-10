import { describe, it, expect } from 'vitest'
import { convertToN8nWorkflow, type WorkflowStep } from '@/lib/workflowConverter'

const wf = (aiText: string) =>
  convertToN8nWorkflow({
    workflow_id: 'w', title: 't', trigger: 'Every day', trigger_app: 'schedule',
    steps: [
      { step: 1, action: 'Read leads', tool: 'googlesheets action', app: 'googlesheets', appAction: 'read', output: '', type: 'action' },
      { step: 2, action: 'AI Lead Scoring', tool: 'openai action', app: 'openai', appAction: 'score', output: aiText, type: 'action' },
    ] as WorkflowStep[],
  } as any)

const limit = (w: ReturnType<typeof wf>) => w.nodes.find((n) => n.type === 'n8n-nodes-base.limit')

describe('Limit before an AI step', () => {
  it('is still added when the AI step is not meant to run per item (cost guard)', () => {
    expect(limit(wf('Summarize the feed into one digest'))?.parameters.maxItems).toBe(1)
  })
  it.each([
    "Uses AI to score each lead as hot or cold",
    'Classify every row',
    'Beri skor untuk setiap lead',
    'Analyse all leads one by one',
  ])('is skipped when the step says it runs per item: %s', (text) => {
    expect(limit(wf(text))).toBeUndefined()
  })
})
