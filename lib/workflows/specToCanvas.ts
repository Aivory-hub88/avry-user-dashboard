/**
 * "Generate workflow" dialog result -> canvas nodes.
 *
 * The dialog's spec steps carry only {appId, actionId, inputs}. Turning them
 * into canvas nodes directly (stepsToNodes) left every node without `rawN8n`,
 * so reactFlowToN8n() had nothing to resolve a node type from at deploy time
 * and every node silently shipped as n8n-nodes-base.set ("Edit Fields"): a
 * generated Webhook trigger arrived in n8n as a Set node. The Copilot path
 * fixed this by going through the real converter first; this does the same
 * for the dialog, so both paths type their nodes identically.
 */
import { generatedWorkflowToN8n } from '@/lib/workflows/copilotToN8n'
import { n8nToReactFlow } from '@/lib/n8nMapper'
import type { GeneratedWorkflow, GeneratedWorkflowStep } from '@/lib/workflows/copilotStateMachine'
import type { AivoryWorkflowSpec, WorkflowStep } from '@/types/workflows'
import type { N8nWorkflow } from '@/lib/n8n'

/** `respondToWebhook` / `send_message` -> "Respond to webhook" / "Send message". */
export function humanizeActionId(id: string): string {
  const words = id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .toLowerCase()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : id
}

function toGeneratedStep(step: WorkflowStep): GeneratedWorkflowStep {
  return {
    id: step.id,
    type: step.type === 'trigger' ? 'trigger' : 'action',
    title: humanizeActionId(step.actionId || step.appId || step.id),
    description: '',
    config: step.inputs,
    testable: false,
    app: (step.appId || '').toLowerCase().trim(),
    action: step.actionId,
  }
}

export function specToCanvas(spec: Pick<AivoryWorkflowSpec, 'name' | 'steps'>) {
  // The trigger leads, the rest keep the spec's execution order.
  const trigger = spec.steps.find((s) => s.type === 'trigger') ?? spec.steps[0]
  const ordered = trigger ? [trigger, ...spec.steps.filter((s) => s !== trigger)] : []
  const workflow: GeneratedWorkflow = {
    workflowName: spec.name,
    steps: ordered.map(toGeneratedStep),
    estimate_hours: 0,
    automation_score: 0,
    summary: '',
    nodeConfigs: [],
  }
  const n8n = generatedWorkflowToN8n(workflow, {
    workflowId: `generated-${spec.name}`.slice(0, 60),
    title: spec.name,
  })
  // convertToN8nWorkflow()/n8nToReactFlow() declare structurally identical but
  // nominally different N8nWorkflow types (see handleCopilotApply).
  return n8nToReactFlow(n8n as unknown as N8nWorkflow)
}
