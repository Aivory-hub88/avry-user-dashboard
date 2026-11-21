/**
 * One place that turns an Aether edit into the canvas it would produce.
 *
 * The change preview in the Aether panel and the "Update canvas" button both
 * go through planCanvasEdit, so the connection check the user sees is run on
 * exactly the nodes/edges that would be applied — preview and apply cannot
 * drift apart.
 */
import type { Node, Edge } from '@xyflow/react'
import type { N8nWorkflow } from '@/lib/n8n'
import type { WorkflowNodeData } from '@/types/workflow-node'
import { n8nToReactFlow } from '@/lib/n8nMapper'
import { generatedWorkflowToN8n } from './copilotToN8n'
import type { GeneratedWorkflow } from './copilotStateMachine'
import {
  applyEditToCanvas,
  canvasToGeneratedWorkflow,
  countSteps,
  diffSteps,
  normalizeStepTitle,
  stepIdAliases,
  type CanvasIssue,
  type ChangePreview,
} from './canvasCopilot'

type RFNode = Node<WorkflowNodeData>

/** What the canvas bridge's snapshot() returns. */
export interface CanvasSnapshot {
  nodes: RFNode[]
  edges: Edge[]
  n8n: N8nWorkflow
}

/** The step diff plus the connection check of the canvas that would be applied. */
export interface CanvasEditPreview extends ChangePreview {
  /** Problems left after auto-repair. Non-empty = the edit must not be applied. */
  issues: CanvasIssue[]
  /** Steps whose old settings auto-repair dropped so they stay connected. */
  reset: string[]
  /** Steps in the edited workflow (trigger and branch steps included). */
  steps: number
}

export interface CanvasEditPlan {
  merged: ReturnType<typeof applyEditToCanvas>
  preview: CanvasEditPreview
}

/** Copilot steps -> typed React Flow nodes/edges (via real n8n JSON). */
export function workflowToCanvasGraph(
  workflow: GeneratedWorkflow,
  opts: { workflowId: string; title: string; keepLastStepIntent?: boolean },
): { nodes: RFNode[]; edges: Edge[] } {
  const n8nWorkflow = generatedWorkflowToN8n(workflow, opts)
  // convertToN8nWorkflow()/n8nToReactFlow() declare structurally identical
  // but nominally different N8nWorkflow types.
  const { nodes, edges } = n8nToReactFlow(n8nWorkflow as unknown as N8nWorkflow)
  return { nodes: nodes as RFNode[], edges }
}

/**
 * Apply `workflow` (Aether's edit) onto the canvas in `snap`, without touching
 * the canvas: returns the merged nodes/edges with their connection check, and
 * the preview the panel shows.
 */
export function planCanvasEdit(
  snap: CanvasSnapshot,
  workflow: GeneratedWorkflow,
  opts: { workflowId: string; title: string },
): CanvasEditPlan {
  const next = workflowToCanvasGraph(workflow, { ...opts, keepLastStepIntent: true })
  const before = canvasToGeneratedWorkflow(snap.n8n)
  const keepTrigger =
    before.steps[0]?.type === 'trigger' &&
    (workflow.steps[0]?.id === before.steps[0].id ||
      normalizeStepTitle(before.steps[0].title) === normalizeStepTitle(workflow.steps[0]?.title || ''))
  const merged = applyEditToCanvas(
    { nodes: snap.nodes, edges: snap.edges },
    next,
    { keepTrigger, idAliases: stepIdAliases(workflow.steps, snap.nodes, before.steps) },
  )
  return {
    merged,
    preview: {
      ...diffSteps(before.steps, workflow.steps),
      issues: merged.issues,
      reset: merged.reset,
      steps: countSteps(workflow.steps),
    },
  }
}

/**
 * Panel copy for the connection check. `ok` = the edit may be applied;
 * `lines` lists each problem (one per step) and any steps whose settings were
 * reset by auto-repair.
 */
export function connectionCheckSummary(
  preview: Pick<CanvasEditPreview, 'issues' | 'reset' | 'steps'>,
): { ok: boolean; headline: string; lines: string[] } {
  const lines: string[] = []
  const seen = new Set<string>()
  for (const issue of preview.issues) {
    const key = `${issue.kind}:${issue.nodeId}`
    if (seen.has(key)) continue
    seen.add(key)
    lines.push(issue.message)
  }
  const problems = lines.length
  const ok = problems === 0
  if (preview.reset.length) {
    const names = preview.reset.map((t) => `"${t}"`).join(', ')
    lines.push(
      `Settings will be reset for ${names} so ${preview.reset.length === 1 ? 'it stays' : 'they stay'} connected.`,
    )
  }
  const n = preview.steps
  const headline = !ok
    ? `${problems} connection ${problems === 1 ? 'problem' : 'problems'} — Update canvas is disabled. Ask Aether to fix it.`
    : preview.reset.length
      ? `All ${n} ${n === 1 ? 'step' : 'steps'} connected, with settings reset`
      : `All ${n} ${n === 1 ? 'step' : 'steps'} connected`
  return { ok, headline, lines }
}
