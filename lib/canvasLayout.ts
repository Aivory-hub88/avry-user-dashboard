import { AivoryWorkflowSpec, WorkflowStep, AivoryWorkflowEdge } from '@/types/workflows'

/**
 * Position coordinates for a canvas node
 */
export interface Position {
  x: number
  y: number
}

/**
 * Edge layout information for rendering
 */
export interface EdgeLayout {
  from: Position
  to: Position
  label?: string
  type: 'curved' | 'angular' | 'straight' | 'default'
}

/**
 * Calculate the position of a trigger node on the canvas.
 * Trigger nodes are always positioned at the canvas center.
 *
 * @returns Position object with x: 400, y: 300 (canvas center)
 *
 * @example
 * const triggerPos = calculateTriggerPosition()
 * // Returns: { x: 400, y: 300 }
 */
export function calculateTriggerPosition(): Position {
  return { x: 400, y: 300 }
}

/**
 * Calculate the position of a sequential step on the canvas.
 * Sequential steps are positioned vertically below the trigger with 180px spacing.
 *
 * @param stepIndex - The index of the step in the workflow (0-based)
 * @returns Position object with x: 400 (center), y: 300 + (stepIndex * 180)
 *
 * @example
 * const step1Pos = calculateStepPosition(0)
 * // Returns: { x: 400, y: 300 }
 *
 * const step2Pos = calculateStepPosition(1)
 * // Returns: { x: 400, y: 480 }
 *
 * const step3Pos = calculateStepPosition(2)
 * // Returns: { x: 400, y: 660 }
 */
export function calculateStepPosition(stepIndex: number): Position {
  const baseY = 300
  const verticalSpacing = 180
  return {
    x: 400,
    y: baseY + stepIndex * verticalSpacing,
  }
}

/**
 * Calculate the position of a branching step on the canvas.
 * Branching steps (typically filter steps) create left and right branches with x offsets.
 *
 * @param stepIndex - The index of the step in the workflow (0-based)
 * @param branchDirection - Direction of the branch: 'left' or 'right'
 * @returns Position object with x offset and y position
 *
 * @example
 * const leftBranch = calculateBranchPosition(2, 'left')
 * // Returns: { x: 150, y: 660 }
 *
 * const rightBranch = calculateBranchPosition(2, 'right')
 * // Returns: { x: 650, y: 660 }
 */
export function calculateBranchPosition(
  stepIndex: number,
  branchDirection: 'left' | 'right'
): Position {
  const baseY = 300
  const verticalSpacing = 180
  const horizontalOffset = 250
  const centerX = 400

  const y = baseY + stepIndex * verticalSpacing
  const x = branchDirection === 'left' ? centerX - horizontalOffset : centerX + horizontalOffset

  return { x, y }
}

/**
 * Calculate the layout for an edge connecting two nodes.
 * Determines the routing type and positions for rendering the edge.
 *
 * @param fromStep - The source workflow step
 * @param toStep - The target workflow step
 * @param edge - The edge definition (optional, for labels)
 * @returns EdgeLayout object with from/to positions and routing type
 *
 * @example
 * const layout = calculateEdgeLayout(triggerStep, actionStep)
 * // Returns: { from: { x: 400, y: 300 }, to: { x: 400, y: 480 }, type: 'curved' }
 */
export function calculateEdgeLayout(
  fromStep: WorkflowStep,
  toStep: WorkflowStep,
  edge?: AivoryWorkflowEdge
): EdgeLayout {
  const fromPos = fromStep.position
  const toPos = toStep.position

  // Determine edge type based on positions
  // Default to angular (vertical flow). Only use curved for mostly-horizontal connections.
  const dx = Math.abs(toPos.x - fromPos.x)
  const dy = Math.abs(toPos.y - fromPos.y)
  const type = (dy > 250 && dx < 100) ? 'angular' as const : 'curved' as const

  return {
    from: fromPos,
    to: toPos,
    label: edge?.label,
    type,
  }
}

/**
 * Calculate positions for all steps in a workflow.
 * Handles sequential steps and branching logic.
 *
 * @param spec - The workflow specification
 * @returns Map of step ID to Position
 *
 * @example
 * const positions = calculateAllPositions(spec)
 * // Returns: { step_1: { x: 400, y: 300 }, step_2: { x: 400, y: 480 }, ... }
 */
export function calculateAllPositions(spec: AivoryWorkflowSpec): Map<string, Position> {
  const positions = new Map<string, Position>()

  // Find trigger step
  const triggerStep = spec.steps.find((s) => s.type === 'trigger')
  if (!triggerStep) {
    return positions
  }

  // Position trigger at center
  positions.set(triggerStep.id, calculateTriggerPosition())

  // Track which steps have been positioned
  const positioned = new Set<string>([triggerStep.id])

  // Position remaining steps sequentially
  let stepIndex = 1
  for (const step of spec.steps) {
    if (step.id === triggerStep.id) continue
    if (positioned.has(step.id)) continue

    positions.set(step.id, calculateStepPosition(stepIndex))
    positioned.add(step.id)
    stepIndex++
  }

  return positions
}

/**
 * Calculate layouts for all edges in a workflow.
 *
 * @param spec - The workflow specification
 * @param edges - The workflow edges
 * @param positions - Map of step ID to Position (from calculateAllPositions)
 * @returns Array of EdgeLayout objects
 *
 * @example
 * const positions = calculateAllPositions(spec)
 * const edgeLayouts = calculateAllEdgeLayouts(spec, edges, positions)
 */
export function calculateAllEdgeLayouts(
  spec: AivoryWorkflowSpec,
  edges: AivoryWorkflowEdge[],
  positions: Map<string, Position>
): EdgeLayout[] {
  const stepMap = new Map(spec.steps.map((s) => [s.id, s]))

  return edges
    .map((edge) => {
      const fromStep = stepMap.get(edge.from)
      const toStep = stepMap.get(edge.to)

      if (!fromStep || !toStep) {
        return null
      }

      return calculateEdgeLayout(fromStep, toStep, edge)
    })
    .filter((layout): layout is EdgeLayout => layout !== null)
}
