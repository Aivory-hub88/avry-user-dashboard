/**
 * n8n ↔ ReactFlow Mapper
 * 
 * Bidirectional conversion between n8n workflow format and ReactFlow node/edge format.
 * Preserves all node properties and handles edge cases gracefully.
 */

import { type Node, type Edge } from '@xyflow/react'
import { N8nWorkflow, N8nNode, N8nConnections } from './n8n'
import type { WorkflowNodeData, WorkflowNodeCategory } from '@/types/workflow-node'
import { WORKFLOW_TEMPLATES } from '@/config/workflow-templates'

// Extended ReactFlow node with n8n-specific data
export interface AivoryNode extends Node {
  data: {
    label: string
    tool?: string
    output?: string
    type: 'trigger' | 'step'
    index?: number
    isSelected?: boolean
    n8nType?: string
    n8nParameters?: Record<string, any>
  }
}

/**
 * Convert n8n workflow to ReactFlow nodes and edges
 * @param workflow n8n workflow object
 * @returns Object with nodes and edges arrays
 */
export function n8nToReactFlow(
  workflow: N8nWorkflow
): { nodes: Node<WorkflowNodeData>[]; edges: Edge[] } {
  const nodes: Node<WorkflowNodeData>[] = []
  const edges: Edge[] = []

  if (!workflow.nodes || workflow.nodes.length === 0) {
    return { nodes, edges }
  }

  // n8n connections are keyed by node NAME, not node ID.
  // Build a name→id lookup so we can resolve edges correctly.
  const nameToId = new Map<string, string>()
  workflow.nodes.forEach((n) => nameToId.set(n.name, n.id))

  // Build adjacency map (by ID) for layout calculation
  const adjacency = new Map<string, string[]>()
  workflow.nodes.forEach((n) => adjacency.set(n.id, []))

  if (workflow.connections) {
    Object.entries(workflow.connections).forEach(([sourceName, outputs]) => {
      const sourceId = nameToId.get(sourceName)
      if (!sourceId) return
      // outputs.main is Array<Array<N8nConnectionTarget>> — iterate branches then targets
      const branches = outputs.main ?? []
      branches.forEach((branch) => {
        branch.forEach((conn) => {
          const targetId = nameToId.get(conn.node) ?? conn.node
          const targets = adjacency.get(sourceId) || []
          targets.push(targetId)
          adjacency.set(sourceId, targets)
        })
      })
    })
  }

  // Assign layout levels via BFS from trigger nodes
  const levels = new Map<string, number>()
  const visited = new Set<string>()

  function assignLevel(nodeId: string, level: number) {
    if (visited.has(nodeId)) return
    visited.add(nodeId)
    levels.set(nodeId, level)
    const targets = adjacency.get(nodeId) || []
    targets.forEach((targetId) => assignLevel(targetId, level + 1))
  }

  workflow.nodes.forEach((n) => {
    if (mapN8nNodeType(n.type) === 'trigger') assignLevel(n.id, 0)
  })
  workflow.nodes.forEach((n) => {
    if (!visited.has(n.id)) assignLevel(n.id, 0)
  })

  // Count nodes per level for vertical stacking within a column
  const indexPerLevel = new Map<number, number>()

  workflow.nodes.forEach((n8nNode) => {
    const level = levels.get(n8nNode.id) ?? 0
    const indexInLevel = indexPerLevel.get(level) ?? 0
    indexPerLevel.set(level, indexInLevel + 1)

    const workflowData = mapN8nNodeToWorkflowData(n8nNode, workflow.id)

    nodes.push({
      id: n8nNode.id,
      data: workflowData,
      position: { x: level * 320, y: indexInLevel * 180 },
      type: 'standardNode',
    })
  })

  // Build edges — resolve target names to IDs
  if (workflow.connections) {
    Object.entries(workflow.connections).forEach(([sourceName, outputs]) => {
      const sourceId = nameToId.get(sourceName)
      if (!sourceId) return

      const sourceData = mapN8nNodeToWorkflowData(
        workflow.nodes.find((n) => n.id === sourceId)!
      )
      const isCondition = sourceData.category === 'condition'

      // outputs.main is Array<Array<N8nConnectionTarget>> — index = branch index (0=true, 1=false)
      const branches = outputs.main ?? []
      branches.forEach((branch, branchIndex) => {
        branch.forEach((conn) => {
          const targetId = nameToId.get(conn.node) ?? conn.node

          let handleId: string | undefined
          if (isCondition) {
            handleId = branchIndex === 0 ? 'out-yes' : branchIndex === 1 ? 'out-no' : undefined
          }

          edges.push({
            id: `${sourceId}-${targetId}-${branchIndex}`,
            source: sourceId,
            target: targetId,
            sourceHandle: handleId,
            animated: false,
            type: 'n8nAdaptive',
          })
        })
      })
    })
  }

  return { nodes, edges }
}

/**
 * Convert ReactFlow nodes and edges back to n8n workflow format
 * @param nodes ReactFlow nodes
 * @param edges ReactFlow edges
 * @param baseWorkflow Base n8n workflow to merge with
 * @returns Updated n8n workflow object
 */
export function reactFlowToN8n(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
  baseWorkflow: N8nWorkflow
): N8nWorkflow {
  // Start with base workflow to preserve all settings
  const workflow: N8nWorkflow = {
    ...baseWorkflow,
    nodes: [],
    connections: {},
  }

  // Map ReactFlow nodes back to n8n format
  // Build id→name map for connection key resolution
  const idToName = new Map<string, string>()
  nodes.forEach((node) => {
    const originalN8nNode = baseWorkflow.nodes?.find((n) => n.id === node.id)
    const name = node.data.title || originalN8nNode?.name || 'Unnamed Node'
    idToName.set(node.id, name)
  })

  nodes.forEach((node) => {
    const rawN8n = node.data.rawN8n
    const originalN8nNode = baseWorkflow.nodes?.find((n) => n.id === node.id)
    const name = idToName.get(node.id) || 'Unnamed Node'
    
    const n8nNode: N8nNode = {
      id: node.id,
      name,
      type: rawN8n?.type || originalN8nNode?.type || 'n8n-nodes-base.set',
      typeVersion: rawN8n?.typeVersion || originalN8nNode?.typeVersion || 1,
      position: [node.position.x, node.position.y] as [number, number],
      parameters: rawN8n?.parameters || originalN8nNode?.parameters || {},
    }

    workflow.nodes.push(n8nNode)
  })

  // Map ReactFlow edges back to n8n connections format
  // n8n connections are keyed by source node NAME, target is also node NAME
  // Format: { [sourceName]: { main: Array<Array<N8nConnectionTarget>> } }
  edges.forEach((edge) => {
    const sourceName = idToName.get(edge.source) || edge.source
    const targetName = idToName.get(edge.target) || edge.target

    if (!workflow.connections[sourceName]) {
      workflow.connections[sourceName] = { main: [] }
    }

    // Determine branch index: 0 = true/main, 1 = false/no
    const branchIndex = edge.sourceHandle === 'out-no' ? 1 : 0

    // Ensure the branch array exists
    while (workflow.connections[sourceName].main.length <= branchIndex) {
      workflow.connections[sourceName].main.push([])
    }

    workflow.connections[sourceName].main[branchIndex].push({
      node: targetName,
      type: 'main',
      index: 0,
    })
  })

  return workflow
}

/**
 * Map n8n node to WorkflowNodeData with category and visual styling
 * @param n8nNode n8n node object
 * @param workflowId optional workflow ID for template lookup
 * @returns WorkflowNodeData for visual rendering
 */
/**
 * Convert a raw n8n type string like "@n8n/n8n-nodes-langchain.agent"
 * or "n8n-nodes-base.emailSend" into a readable label like "Agent" or "Email Send".
 */
function humanizeN8nType(type: string): string {
  if (!type) return 'Step';
  // Extract the part after the last dot: "n8n-nodes-base.emailSend" → "emailSend"
  const afterDot = type.includes('.') ? type.split('.').pop()! : type;
  // Split camelCase into words: "emailSend" → "Email Send"
  return afterDot
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
    .trim() || 'Step';
}

function mapN8nNodeToWorkflowData(
  n8nNode: N8nNode,
  workflowId?: string
): WorkflowNodeData {
  // Check if there's a template for this workflow
  const template = workflowId
    ? WORKFLOW_TEMPLATES.find((t) => t.id === workflowId)
    : undefined;

  // Try to find step metadata by node name or id
  const stepMeta = template?.steps.find(
    (s) => s.nodeNameOrId === n8nNode.name || s.nodeNameOrId === n8nNode.id
  );

  // Start with template metadata if available, otherwise use defaults
  const category = stepMeta?.categoryOverride || detectNodeCategory(n8nNode.type);
  const icon = getCategoryIcon(category);

  const data: WorkflowNodeData = {
    label: stepMeta?.title || n8nNode.name || humanizeN8nType(n8nNode.type),
    title: stepMeta?.title || n8nNode.name || humanizeN8nType(n8nNode.type),
    subtitle: stepMeta?.subtitle,
    description: stepMeta?.description,
    category,
    // Don't pass icon — WorkflowNode derives its own Lucide icon from category
    rawN8n: n8nNode,
  };

  // For condition nodes, add YES/NO outputs
  if (category === 'condition') {
    data.outputs = [
      { id: 'out-yes', label: 'Yes' },
      { id: 'out-no', label: 'No' },
    ];
  }

  return data;
}

/**
 * Detect node category from n8n node type
 * @param n8nType n8n node type string
 * @returns WorkflowNodeCategory
 */
function detectNodeCategory(n8nType: string): WorkflowNodeCategory {
  const lower = n8nType.toLowerCase()

  // Trigger nodes
  if (
    lower.includes('trigger') ||
    lower.includes('webhook') ||
    lower.includes('manual')
  ) {
    return 'trigger'
  }

  // AI nodes
  if (
    lower.includes('openai') ||
    lower.includes('chat') ||
    lower.includes('ai') ||
    lower.includes('anthropic') ||
    lower.includes('huggingface')
  ) {
    return 'ai'
  }

  // Condition nodes
  if (
    lower.includes('if') ||
    lower.includes('condition') ||
    lower.includes('switch')
  ) {
    return 'condition'
  }

  // Channel nodes (communication)
  if (
    lower.includes('email') ||
    lower.includes('slack') ||
    lower.includes('discord') ||
    lower.includes('telegram') ||
    lower.includes('twilio') ||
    lower.includes('sms')
  ) {
    return 'channel'
  }

  // System nodes
  if (
    lower.includes('function') ||
    lower.includes('code') ||
    lower.includes('script')
  ) {
    return 'system'
  }

  // Default to action
  return 'action'
}

/**
 * Get icon for node category
 * @param category WorkflowNodeCategory
 * @returns Icon emoji/string
 */
function getCategoryIcon(category: WorkflowNodeCategory): string {
  const iconMap: Record<WorkflowNodeCategory, string> = {
    trigger: 'webhook',
    action:  'http',
    ai:      'code',
    condition: 'branch',
    channel: 'respond',
    system:  'code',
    app:     'http',
  }
  return iconMap[category] || 'http'
}

/**
 * Map n8n node type to ReactFlow node type
 * @param n8nType n8n node type string
 * @returns ReactFlow node type ('trigger' or 'step')
 */
function mapN8nNodeType(n8nType: string): 'trigger' | 'step' {
  // Trigger node types
  if (
    n8nType.includes('trigger') ||
    n8nType.includes('Trigger') ||
    n8nType === 'n8n-nodes-base.manualTrigger'
  ) {
    return 'trigger'
  }

  // Everything else is a step
  return 'step'
}

/**
 * Validate n8n workflow structure
 * @param workflow Workflow to validate
 * @returns true if valid, false otherwise
 */
export function isValidN8nWorkflow(workflow: any): boolean {
  if (!workflow || typeof workflow !== 'object') {
    return false
  }

  if (!Array.isArray(workflow.nodes)) {
    return false
  }

  if (typeof workflow.connections !== 'object') {
    return false
  }

  // Check that all nodes have required properties
  return workflow.nodes.every(
    (node: any) =>
      node.id &&
      node.name &&
      node.type &&
      node.position &&
      typeof node.position.x === 'number' &&
      typeof node.position.y === 'number'
  )
}

/**
 * Validate ReactFlow nodes structure
 * @param nodes Nodes to validate
 * @returns true if valid, false otherwise
 */
export function isValidReactFlowNodes(nodes: any[]): boolean {
  if (!Array.isArray(nodes)) {
    return false
  }

  return nodes.every(
    (node) =>
      node.id &&
      node.data &&
      node.data.label &&
      node.position &&
      typeof node.position.x === 'number' &&
      typeof node.position.y === 'number'
  )
}
