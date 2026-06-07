/**
 * Workflow Validation Utilities
 * 
 * This module provides utility functions for validating workflow specifications
 * against all constraints: trigger requirement, app connections, connection status,
 * and cycle detection.
 * 
 * @module lib/workflowValidation
 */

import { AivoryWorkflowSpec, AivoryWorkflowEdge, WorkflowStep } from '@/types/workflows'

/**
 * Structured error object returned by validation functions
 * 
 * @interface ValidationError
 * @property {string} field - The field or aspect that failed validation
 * @property {string} reason - Detailed explanation of why validation failed
 */
export interface ValidationError {
  field: string
  reason: string
}

/**
 * Validates that at least one trigger step exists in the workflow
 * 
 * A workflow must have exactly one trigger step to be executable.
 * The trigger step is the entry point for workflow execution.
 * 
 * @param {AivoryWorkflowSpec} spec - The workflow specification to validate
 * @returns {ValidationError | null} Error object if validation fails, null if passes
 * 
 * @example
 * const spec = { steps: [{ type: 'action', ... }], ... }
 * const error = validateTriggerExists(spec)
 * // Returns: { field: 'steps', reason: 'Workflow must have at least one trigger step' }
 */
export function validateTriggerExists(spec: AivoryWorkflowSpec): ValidationError | null {
  const hasTrigger = spec.steps.some(step => step.type === 'trigger')
  
  if (!hasTrigger) {
    return {
      field: 'steps',
      reason: 'Workflow must have at least one trigger step'
    }
  }
  
  return null
}

/**
 * Validates that all appIds in the workflow exist in the available apps list
 * 
 * Every step in the workflow must reference an app that the user has connected.
 * This prevents workflows from failing at runtime due to missing integrations.
 * 
 * @param {AivoryWorkflowSpec} spec - The workflow specification to validate
 * @param {string[]} availableAppIds - List of app IDs the user has connected
 * @returns {ValidationError | null} Error object if validation fails, null if passes
 * 
 * @example
 * const spec = { steps: [{ appId: 'slack', ... }], ... }
 * const availableAppIds = ['gmail', 'notion']
 * const error = validateAppConnections(spec, availableAppIds)
 * // Returns: { field: 'appId', reason: 'App slack is not available. Please connect it first.' }
 */
export function validateAppConnections(
  spec: AivoryWorkflowSpec,
  availableAppIds: string[]
): ValidationError | null {
  for (const step of spec.steps) {
    if (!availableAppIds.includes(step.appId)) {
      return {
        field: 'appId',
        reason: `App ${step.appId} is not available. Please connect it first.`
      }
    }
  }
  
  return null
}

/**
 * Validates that all connectionIds in the workflow are active
 * 
 * A connection is active when the user has authenticated with the app
 * and the connection is not expired or revoked.
 * 
 * @param {AivoryWorkflowSpec} spec - The workflow specification to validate
 * @param {Record<string, boolean>} connectionStatus - Map of connectionId to active status
 * @returns {ValidationError | null} Error object if validation fails, null if passes
 * 
 * @example
 * const spec = { steps: [{ connectionId: 'conn_1', ... }], ... }
 * const connectionStatus = { 'conn_1': false }
 * const error = validateConnectionStatus(spec, connectionStatus)
 * // Returns: { field: 'connectionId', reason: 'Connection conn_1 is not active. Please reconnect.' }
 */
export function validateConnectionStatus(
  spec: AivoryWorkflowSpec,
  connectionStatus: Record<string, boolean>
): ValidationError | null {
  for (const step of spec.steps) {
    const isActive = connectionStatus[step.connectionId]
    
    if (isActive === undefined || !isActive) {
      return {
        field: 'connectionId',
        reason: `Connection ${step.connectionId} is not active. Please reconnect.`
      }
    }
  }
  
  return null
}

/**
 * Detects cycles in the workflow using depth-first search
 * 
 * Workflows must be acyclic (DAG - Directed Acyclic Graph) to prevent
 * infinite loops during execution. This function uses DFS to detect cycles.
 * 
 * Algorithm:
 * 1. Build adjacency list from edges
 * 2. For each unvisited node, perform DFS
 * 3. Track visiting state (white/gray/black) to detect back edges
 * 4. A back edge indicates a cycle
 * 
 * @param {AivoryWorkflowEdge[]} edges - The workflow edges
 * @param {string[]} stepIds - All step IDs in the workflow
 * @returns {ValidationError | null} Error object if cycle detected, null if acyclic
 * 
 * @example
 * const edges = [
 *   { from: 'step_1', to: 'step_2' },
 *   { from: 'step_2', to: 'step_1' }  // Creates cycle
 * ]
 * const stepIds = ['step_1', 'step_2']
 * const error = detectCycles(edges, stepIds)
 * // Returns: { field: 'edges', reason: 'Workflow contains a cycle. Workflows must be linear or tree-like.' }
 */
export function detectCycles(
  edges: AivoryWorkflowEdge[],
  stepIds: string[]
): ValidationError | null {
  // Build adjacency list
  const adjacencyList: Record<string, string[]> = Object.create(null)
  for (const stepId of stepIds) {
    adjacencyList[stepId] = []
  }
  
  for (const edge of edges) {
    if (adjacencyList[edge.from]) {
      adjacencyList[edge.from].push(edge.to)
    }
  }
  
  // Track node states: 0 = white (unvisited), 1 = gray (visiting), 2 = black (visited)
  const state: Record<string, number> = Object.create(null)
  for (const stepId of stepIds) {
    state[stepId] = 0
  }
  
  /**
   * DFS helper function to detect cycles
   * @param nodeId - Current node being visited
   * @returns true if cycle detected, false otherwise
   */
  function hasCycleDFS(nodeId: string): boolean {
    state[nodeId] = 1 // Mark as visiting (gray)
    
    for (const neighbor of adjacencyList[nodeId]) {
      if (state[neighbor] === 1) {
        // Back edge found - cycle detected
        return true
      }
      
      if (state[neighbor] === 0 && hasCycleDFS(neighbor)) {
        return true
      }
    }
    
    state[nodeId] = 2 // Mark as visited (black)
    return false
  }
  
  // Check all nodes for cycles
  for (const stepId of stepIds) {
    if (state[stepId] === 0) {
      if (hasCycleDFS(stepId)) {
        return {
          field: 'edges',
          reason: 'Workflow contains a cycle. Workflows must be linear or tree-like.'
        }
      }
    }
  }
  
  return null
}

/**
 * Orchestrator function that runs all validations on a workflow spec
 * 
 * This function validates the workflow against all constraints:
 * 1. At least one trigger step exists
 * 2. All appIds exist in availableApps
 * 3. All connectionIds are active
 * 4. No cycles exist in the workflow edges
 * 
 * Validations are run in order and the first error is returned.
 * 
 * @param {AivoryWorkflowSpec} spec - The workflow specification to validate
 * @param {string[]} availableAppIds - List of app IDs the user has connected
 * @param {Record<string, boolean>} connectionStatus - Map of connectionId to active status
 * @param {AivoryWorkflowEdge[]} edges - The workflow edges
 * @returns {ValidationError | null} First validation error found, or null if all pass
 * 
 * @example
 * const spec = { steps: [...], ... }
 * const availableAppIds = ['slack', 'gmail']
 * const connectionStatus = { 'conn_1': true }
 * const edges = [{ from: 'step_1', to: 'step_2' }]
 * 
 * const error = validateWorkflowSpec(spec, availableAppIds, connectionStatus, edges)
 * if (error) {
 *   console.error(`Validation failed: ${error.reason}`)
 * }
 */
export function validateWorkflowSpec(
  spec: AivoryWorkflowSpec,
  availableAppIds: string[],
  connectionStatus: Record<string, boolean>,
  edges: AivoryWorkflowEdge[]
): ValidationError | null {
  // Validate trigger exists
  const triggerError = validateTriggerExists(spec)
  if (triggerError) return triggerError
  
  // Validate app connections
  const appError = validateAppConnections(spec, availableAppIds)
  if (appError) return appError
  
  // Validate connection status
  const connectionError = validateConnectionStatus(spec, connectionStatus)
  if (connectionError) return connectionError
  
  // Detect cycles
  const stepIds = spec.steps.map(step => step.id)
  const cycleError = detectCycles(edges, stepIds)
  if (cycleError) return cycleError
  
  return null
}
