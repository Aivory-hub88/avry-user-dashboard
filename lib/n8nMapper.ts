/**
 * n8n ↔ ReactFlow Mapper
 * 
 * Bidirectional conversion between n8n workflow format and ReactFlow node/edge format.
 * Preserves all node properties and handles edge cases gracefully.
 */

import { type Node, type Edge } from '@xyflow/react'
import { N8nWorkflow, N8nNode, N8nConnections } from './n8n'
import type { WorkflowNodeData, WorkflowNodeCategory, NodeConfig } from '@/types/workflow-node'
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

// ── NodeConfig → n8n parameters ─────────────────────────────
// Inverse of inspector/nodeConfigUtils.extractConfigFromNode: turns the typed
// canvas config (edited via the inspector or the setup copilot) into concrete
// n8n node parameters so "Deploy to n8n" ships what the user configured.

/** The n8n node type implied by a typed config (used when the node has no rawN8n type). */
export function configToN8nType(config: NodeConfig): string | null {
  switch (config.type) {
    case 'httpRequest':   return 'n8n-nodes-base.httpRequest'
    case 'webhook':       return 'n8n-nodes-base.webhook'
    case 'schedule':      return 'n8n-nodes-base.scheduleTrigger'
    case 'manualTrigger': return 'n8n-nodes-base.manualTrigger'
    case 'ifCondition':   return 'n8n-nodes-base.if'
    case 'editFields':    return 'n8n-nodes-base.set'
    case 'httpResponse':  return 'n8n-nodes-base.respondToWebhook'
    default:              return null
  }
}

/** typeVersion matching the parameter shapes written by configToN8nParameters. */
export function configToN8nTypeVersion(config: NodeConfig): number | null {
  switch (config.type) {
    case 'httpRequest':   return 4.2
    case 'webhook':       return 2
    case 'schedule':      return 1.2
    case 'ifCondition':   return 1
    case 'editFields':    return 1
    default:              return 1
  }
}

/** Serialize a typed canvas config into n8n node parameters. Returns null for configs with no mapping. */
export function configToN8nParameters(config: NodeConfig): Record<string, any> | null {
  switch (config.type) {
    case 'httpRequest': {
      const headers = [...(config.headers ?? [])]
      // Auth is expressed as headers so the deployed workflow works without
      // pre-provisioned n8n credentials (values may be n8n expressions like ={{ $env.TOKEN }}).
      const af = config.authFields ?? {}
      if (config.authentication === 'bearerToken' && af.token) {
        headers.push({ key: 'Authorization', value: af.token.startsWith('Bearer') || af.token.startsWith('=') ? af.token : `Bearer ${af.token}` })
      } else if (config.authentication === 'apiKey' && af.keyValue) {
        headers.push({ key: af.keyName || 'X-API-Key', value: af.keyValue })
      } else if (config.authentication === 'basicAuth' && af.username) {
        headers.push({ key: 'Authorization', value: `={{ 'Basic ' + Buffer.from('${af.username}:${af.password ?? ''}').toString('base64') }}` })
      }
      const sendHeaders = config.sendHeaders || headers.length > 0
      return {
        method: config.method,
        url: config.url,
        sendHeaders,
        ...(sendHeaders ? { headerParameters: { parameters: headers.map(h => ({ name: h.key, value: h.value })) } } : {}),
        sendQuery: config.sendQuery,
        ...(config.sendQuery ? { queryParameters: { parameters: (config.queryParams ?? []).map(q => ({ name: q.key, value: q.value })) } } : {}),
        sendBody: config.sendBody,
        ...(config.sendBody ? {
          contentType: config.bodyType === 'form' ? 'form-urlencoded' : config.bodyType,
          ...(config.bodyType === 'json' ? { specifyBody: 'json', jsonBody: config.body } : { body: config.body }),
        } : {}),
      }
    }
    case 'webhook':
      return {
        httpMethod: config.httpMethod,
        path: (config.path || '/').replace(/^\//, ''),
        responseMode: config.respondWith === 'immediately' ? 'onReceived'
          : config.respondWith === 'lastNode' ? 'lastNode' : 'responseNode',
      }
    case 'schedule': {
      const n = Math.max(1, Number(config.interval) || 1)
      const intervalField: Record<string, any> = {
        minutes: { field: 'minutes', minutesInterval: n },
        hours:   { field: 'hours',   hoursInterval: n },
        days:    { field: 'days',    daysInterval: n },
        weeks:   { field: 'weeks',   weeksInterval: n },
      }[config.unit] ?? { field: 'hours', hoursInterval: n }
      return { rule: { interval: [intervalField] }, ...(config.timezone ? { timezone: config.timezone } : {}) }
    }
    case 'ifCondition':
      return {
        conditions: {
          boolean: config.conditions.map(c => ({ value1: c.field, operation: c.operator, value2: c.value })),
        },
        combineOperation: config.combinator,
      }
    case 'editFields':
      return { values: { string: config.fields.map(f => ({ name: f.key, value: f.value })) } }
    case 'httpResponse':
      return {
        respondWith: 'text',
        responseBody: config.responseBody,
        statusCode: config.statusCode,
        options: { responseCode: config.statusCode },
      }
    case 'manualTrigger':
      return {}
    default:
      // aiStep / agent / generic — no direct n8n parameter mapping; keep rawN8n params.
      return null
  }
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

    // Typed canvas config (inspector / setup copilot) wins over stale raw params —
    // this is what makes "Deploy to n8n" ship the user's configuration.
    const config = node.data.config
    const configParams = config ? configToN8nParameters(config) : null
    const baseParams = rawN8n?.parameters || originalN8nNode?.parameters || {}

    const n8nNode: N8nNode = {
      id: node.id,
      name,
      type: rawN8n?.type || originalN8nNode?.type || (config ? configToN8nType(config) : null) || 'n8n-nodes-base.set',
      typeVersion: rawN8n?.typeVersion || originalN8nNode?.typeVersion || (config ? configToN8nTypeVersion(config) : null) || 1,
      position: [node.position.x, node.position.y] as [number, number],
      parameters: configParams ? { ...baseParams, ...configParams } : baseParams,
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
