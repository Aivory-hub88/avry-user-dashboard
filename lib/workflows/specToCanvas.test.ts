import { describe, it, expect } from 'vitest'
import { specToCanvas, humanizeActionId } from './specToCanvas'
import { reactFlowToN8n } from '@/lib/n8nMapper'
import { detectNodeIntent } from './nodeMapper'
import type { WorkflowStep } from '@/types/workflows'

// What the "Generate Workflow" dialog produced for: a POST webhook that answers
// with a JSON body. Taken from the live run that shipped both nodes as Set nodes.
const step = (id: string, type: WorkflowStep['type'], actionId: string): WorkflowStep => ({
  id, type, appId: 'webhook', actionId, connectionId: '', inputs: {}, position: { x: 0, y: 0 },
})
const spec = {
  name: 'Workflow Tes Sederhana',
  steps: [step('step_1', 'trigger', 'post'), step('step_2', 'action', 'respondToWebhook')],
}

describe('specToCanvas', () => {
  it('builds a real Webhook trigger and a Respond to Webhook node, not Set nodes', () => {
    const { nodes } = specToCanvas(spec)
    const types = nodes.map((n) => (n.data as { rawN8n?: { type?: string } }).rawN8n?.type)
    expect(types[0]).toBe('n8n-nodes-base.webhook')
    expect(types).toContain('n8n-nodes-base.respondToWebhook')
    expect(types).not.toContain('n8n-nodes-base.set')
    expect(types.every(Boolean)).toBe(true)
  })

  it('keeps those types through deploy (reactFlowToN8n), the step that used to fall back to Set', () => {
    const { nodes, edges } = specToCanvas(spec)
    const deployed = reactFlowToN8n(nodes, edges, { name: 'x', nodes: [], connections: {} } as never)
    expect(deployed.nodes.map((n) => n.type)).not.toContain('n8n-nodes-base.set')
    expect(deployed.nodes[0].type).toBe('n8n-nodes-base.webhook')
    expect(Object.keys(deployed.connections).length).toBeGreaterThan(0)
  })

  it('names nodes from the action, not the HTTP method', () => {
    const { nodes } = specToCanvas(spec)
    expect(nodes.map((n) => n.data.title)).not.toContain('post')
  })

  it('puts the trigger first even if the spec lists it later', () => {
    const { nodes } = specToCanvas({ ...spec, steps: [spec.steps[1], spec.steps[0]] })
    expect((nodes[0].data as { rawN8n?: { type?: string } }).rawN8n?.type).toBe('n8n-nodes-base.webhook')
  })
})

describe('humanizeActionId', () => {
  it('splits camelCase and snake_case', () => {
    expect(humanizeActionId('respondToWebhook')).toBe('Respond to webhook')
    expect(humanizeActionId('send_message')).toBe('Send message')
    expect(humanizeActionId('post')).toBe('Post')
  })
})

describe('detectNodeIntent with camelCase action ids', () => {
  it('recognises respondToWebhook as a respond step', () => {
    expect(detectNodeIntent('respondToWebhook', 'webhook action')).toBe('respond')
  })
  it('still sends email-ish ids to email', () => {
    expect(detectNodeIntent('sendEmailReply')).toBe('email')
  })
})
