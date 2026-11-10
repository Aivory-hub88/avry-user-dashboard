/**
 * Copilot plan -> n8n workflow. The single place that turns what Aivory
 * Aether produced (a GeneratedWorkflow step tree) into n8n workflow JSON.
 *
 * Shared by the workflows page (Apply to canvas / Update canvas) and the
 * workflow-builder eval, so the eval scores exactly what a user would get.
 */
import { convertToN8nWorkflow, type WorkflowStep as ConverterWorkflowStep } from '@/lib/workflowConverter'
import type { GeneratedWorkflow, GeneratedWorkflowStep } from '@/lib/workflows/copilotStateMachine'

/**
 * convertToN8nWorkflow() needs the FULL nested step tree — condition/switch/
 * loop steps' `branches` — not a flat list. Losing branches would silently
 * turn every real branch/loop into a dead end.
 */
export function toConverterStep(step: GeneratedWorkflowStep): ConverterWorkflowStep {
  return {
    step: 0,
    action: step.title,
    tool: [step.app, step.type].filter(Boolean).join(' '),
    output: step.description || '',
    inputs: step.config,
    type: step.type,
    branches: step.branches?.map((b) => ({
      key: b.key,
      label: b.label,
      steps: b.steps.map(toConverterStep),
    })),
    loopConfig: step.loopConfig,
  }
}

export interface GeneratedToN8nOptions {
  workflowId: string
  title: string
  /** Keep every step's detected intent, even the last (used when editing an open canvas). */
  keepLastStepIntent?: boolean
}

export function generatedWorkflowToN8n(workflow: GeneratedWorkflow, opts: GeneratedToN8nOptions) {
  return convertToN8nWorkflow({
    workflow_id: opts.workflowId,
    title: opts.title,
    // The first step is the trigger; the converter picks schedule vs webhook
    // from its text.
    trigger: workflow.steps[0]?.title || '',
    steps: workflow.steps.slice(1).map(toConverterStep),
    keepLastStepIntent: opts.keepLastStepIntent,
  })
}
