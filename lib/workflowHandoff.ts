/**
 * Workflow Handoff Utilities
 * 
 * Implements localStorage-based handoff between AI Console and Workflow Tab.
 * Handles serialization, deserialization, TTL checking, and cleanup.
 */

import { AivoryWorkflowSpec } from '@/types/workflows'
import { parseWorkflowSpec, serializeWorkflowSpec } from './workflowSerializer'
import type { Node, Edge } from '@xyflow/react'

const HANDOFF_KEY = 'pendingWorkflowSpec'
const HANDOFF_TTL_MS = 5 * 60 * 1000 // 5 minutes

export interface HandoffEdge {
  from: string
  to: string
  label?: string
}

export interface HandoffData {
  spec: AivoryWorkflowSpec
  edges: HandoffEdge[]
  timestamp: number
}

/**
 * Store a workflow spec in localStorage for handoff to Workflow Tab
 * 
 * @param spec - The workflow specification to store
 * @returns true if successful, false otherwise
 * 
 * @example
 * const spec = { name: "My Workflow", ... }
 * const success = storeWorkflowSpec(spec)
 * if (success) {
 *   window.location.href = '/workflows?fromConsole=true'
 * }
 */
export function storeWorkflowSpec(spec: AivoryWorkflowSpec, edges?: HandoffEdge[]): boolean {
  try {
    const handoffData: HandoffData = {
      spec,
      edges: edges || [],
      timestamp: Date.now(),
    }
    localStorage.setItem(HANDOFF_KEY, JSON.stringify(handoffData))
    return true
  } catch (err) {
    console.error('[storeWorkflowSpec] Failed to store spec:', err)
    return false
  }
}

/**
 * Retrieve a workflow spec from localStorage
 * 
 * Checks TTL and returns null if spec is stale (>5 minutes old).
 * 
 * @returns The workflow specification if valid, null otherwise
 * 
 * @example
 * const spec = retrieveWorkflowSpec()
 * if (spec) {
 *   renderWorkflow(spec)
 * } else {
 *   showMessage('Workflow session expired')
 * }
 */
export function retrieveWorkflowSpec(): HandoffData | null {
  try {
    const stored = localStorage.getItem(HANDOFF_KEY)
    if (!stored) {
      return null
    }

    const handoffData: HandoffData = JSON.parse(stored)

    // Check TTL
    const age = Date.now() - handoffData.timestamp
    if (age > HANDOFF_TTL_MS) {
      console.warn('[retrieveWorkflowSpec] Spec is stale (age:', age, 'ms)')
      clearWorkflowSpec()
      return null
    }

    // Ensure edges array exists for backward compatibility
    if (!handoffData.edges) {
      handoffData.edges = []
    }

    return handoffData
  } catch (err) {
    console.error('[retrieveWorkflowSpec] Failed to retrieve spec:', err)
    return null
  }
}

/**
 * Clear the stored workflow spec from localStorage
 * 
 * @example
 * clearWorkflowSpec()
 */
export function clearWorkflowSpec(): void {
  try {
    localStorage.removeItem(HANDOFF_KEY)
  } catch (err) {
    console.error('[clearWorkflowSpec] Failed to clear spec:', err)
  }
}

/**
 * Check if a valid workflow spec is available in localStorage
 * 
 * @returns true if a valid spec is available, false otherwise
 * 
 * @example
 * if (hasWorkflowSpec()) {
 *   const spec = retrieveWorkflowSpec()
 *   renderWorkflow(spec)
 * }
 */
export function hasWorkflowSpec(): boolean {
  try {
    const stored = localStorage.getItem(HANDOFF_KEY)
    if (!stored) {
      return false
    }

    const handoffData: HandoffData = JSON.parse(stored)
    const age = Date.now() - handoffData.timestamp

    return age <= HANDOFF_TTL_MS
  } catch (err) {
    return false
  }
}

/**
 * Get the age of the stored workflow spec in milliseconds
 * 
 * @returns Age in milliseconds, or -1 if no spec is stored
 * 
 * @example
 * const age = getWorkflowSpecAge()
 * if (age > 0 && age < 60000) {
 *   console.log('Spec is less than 1 minute old')
 * }
 */
export function getWorkflowSpecAge(): number {
  try {
    const stored = localStorage.getItem(HANDOFF_KEY)
    if (!stored) {
      return -1
    }

    const handoffData: HandoffData = JSON.parse(stored)
    return Date.now() - handoffData.timestamp
  } catch (err) {
    return -1
  }
}

/**
 * Get the remaining TTL for the stored workflow spec in milliseconds
 * 
 * @returns Remaining TTL in milliseconds, or 0 if spec is expired or not found
 * 
 * @example
 * const remaining = getWorkflowSpecTTL()
 * if (remaining > 0) {
 *   console.log(`Spec expires in ${remaining / 1000} seconds`)
 * }
 */
export function getWorkflowSpecTTL(): number {
  const age = getWorkflowSpecAge()
  if (age < 0) {
    return 0
  }

  const remaining = HANDOFF_TTL_MS - age
  return Math.max(0, remaining)
}


/**
 * A workflow step in the console shape, used during handoff conversion.
 */
export interface ConsoleWorkflowStep {
  id: string
  type: string
  appId: string
  actionId: string
  connectionId?: string
  inputs?: Record<string, unknown>
  position?: { x: number; y: number }
}

/**
 * Convert console workflow steps and edges into React Flow nodes and edges.
 *
 * - Each step becomes a React Flow node with type 'standardNode'.
 * - Uses step.position when present, otherwise defaults to { x: 400, y: 300 + index * 180 }.
 * - Maps step data fields (appId, actionId, connectionId, inputs, type) into node.data.
 * - Sets node.data.label and node.data.title from actionId or appId.
 * - Sets node.data.icon based on step type (trigger→'webhook', ai→'code', default→'http').
 * - Sets node.data.category based on step type (trigger→'trigger', ai→'transform', default→'utility').
 * - Edges referencing non-existent step IDs are filtered out.
 *
 * @param steps - Console workflow steps to convert
 * @param edges - Edges describing connections between steps
 * @returns React Flow nodes and edges ready for the canvas
 */
export function convertHandoffToNodes(
  steps: ConsoleWorkflowStep[],
  edges: Array<{ from: string; to: string; label?: string }>
): { nodes: Node[]; edges: Edge[] } {
  // Step 1: Map console steps to React Flow nodes
  const nodes: Node[] = steps.map((step, index) => ({
    id: step.id,
    type: 'standardNode',
    position: step.position ?? { x: 400, y: 300 + index * 180 },
    data: {
      label: step.actionId || step.appId || `Step ${index + 1}`,
      title: step.actionId || step.appId || `Step ${index + 1}`,
      icon: step.type === 'trigger' ? 'webhook'
        : step.type === 'ai' ? 'code'
        : 'http',
      category: step.type === 'trigger' ? 'trigger'
        : step.type === 'ai' ? 'transform'
        : 'utility',
      appId: step.appId,
      actionId: step.actionId,
      connectionId: step.connectionId,
      inputs: step.inputs,
      type: step.type,
    },
  }))

  // Step 2: Build a set of valid node IDs for edge filtering
  const nodeIds = new Set(nodes.map(n => n.id))

  // Step 3: Map edges to React Flow edges, filtering out dangling references
  const rfEdges: Edge[] = (edges || [])
    .filter(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .map((edge, index) => ({
      id: `edge-${edge.from}-${edge.to}`,
      source: edge.from,
      target: edge.to,
      label: edge.label,
      type: 'smoothstep',
      animated: false,
    }))

  return { nodes, edges: rfEdges }
}
