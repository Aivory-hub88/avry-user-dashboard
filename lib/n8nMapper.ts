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
const AI_SUB_CONNECTION_TYPES = ['ai_languageModel', 'ai_memory', 'ai_tool'] as const

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

  // Build adjacency map (by ID) for layout calculation — main-flow only.
  // LangChain sub-nodes (Chat Model/Memory/Tool) connect via ai_* types and
  // are NOT part of the main flow column layout; they're positioned below
  // whatever node they feed once that node's column is known (see below).
  const adjacency = new Map<string, string[]>()
  const subNodeParent = new Map<string, string>() // sub-node id -> node id it feeds
  const modelForAgent = new Map<string, string>() // agent/parent id -> ai_languageModel sub-node id
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
      AI_SUB_CONNECTION_TYPES.forEach((subType) => {
        const subBranches = outputs[subType] ?? []
        subBranches.forEach((branch) => {
          branch.forEach((conn) => {
            const targetId = nameToId.get(conn.node) ?? conn.node
            subNodeParent.set(sourceId, targetId)
            if (subType === 'ai_languageModel') modelForAgent.set(targetId, sourceId)
          })
        })
      })
    })
  }

  // Assign layout levels via BFS from trigger nodes (main-flow only)
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
    if (!visited.has(n.id) && !subNodeParent.has(n.id)) assignLevel(n.id, 0)
  })

  // Count nodes per level for vertical stacking within a column
  const indexPerLevel = new Map<number, number>()
  const positionById = new Map<string, { x: number; y: number }>()

  workflow.nodes.forEach((n8nNode) => {
    if (subNodeParent.has(n8nNode.id)) return // positioned in the pass below

    const level = levels.get(n8nNode.id) ?? 0
    const indexInLevel = indexPerLevel.get(level) ?? 0
    indexPerLevel.set(level, indexInLevel + 1)

    const linkedModelId = modelForAgent.get(n8nNode.id)
    const linkedModelNode = linkedModelId ? workflow.nodes.find((n) => n.id === linkedModelId) : undefined
    const workflowData = mapN8nNodeToWorkflowData(n8nNode, workflow.id, linkedModelNode)
    const position = { x: level * 320, y: indexInLevel * 180 }
    positionById.set(n8nNode.id, position)

    nodes.push({
      id: n8nNode.id,
      data: workflowData,
      position,
      type: 'standardNode',
    })
  })

  // Position sub-nodes directly below the node they feed (staggered if more
  // than one sub-node feeds the same parent, e.g. Chat Model + Memory + Tool).
  const subIndexByParent = new Map<string, number>()
  workflow.nodes.forEach((n8nNode) => {
    const parentId = subNodeParent.get(n8nNode.id)
    if (!parentId) return
    const parentPos = positionById.get(parentId) ?? { x: 0, y: 0 }
    const subIndex = subIndexByParent.get(parentId) ?? 0
    subIndexByParent.set(parentId, subIndex + 1)

    const workflowData = mapN8nNodeToWorkflowData(n8nNode, workflow.id)
    nodes.push({
      id: n8nNode.id,
      data: workflowData,
      position: { x: parentPos.x + subIndex * 180, y: parentPos.y + 200 },
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

      // LangChain sub-node connections (ai_languageModel/ai_memory/ai_tool) —
      // tagged distinctly so reactFlowToN8n() writes them back into the right
      // connection bucket instead of 'main', and so the canvas can style them
      // as sub-connections rather than regular flow steps.
      AI_SUB_CONNECTION_TYPES.forEach((subType) => {
        const subBranches = outputs[subType] ?? []
        subBranches.forEach((branch) => {
          branch.forEach((conn) => {
            const targetId = nameToId.get(conn.node) ?? conn.node
            edges.push({
              id: `${sourceId}-${targetId}-${subType}`,
              source: sourceId,
              target: targetId,
              animated: false,
              type: 'aiSubConnection',
              data: { connectionType: subType },
            })
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
    case 'rssFeed':       return 'n8n-nodes-base.rssFeedRead'
    case 'slack':         return 'n8n-nodes-base.slack'
    case 'gmail':         return 'n8n-nodes-base.gmail'
    // No rawN8n type to preserve means this AI step was never bound to a
    // concrete node (e.g. built purely from the inspector). Default to a
    // real, deployable OpenAI node rather than silently downgrading to Set.
    case 'aiStep':         return 'n8n-nodes-base.openAi'
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
    case 'rssFeed':       return 1.1
    case 'slack':         return 2.2
    case 'gmail':         return 2.1
    case 'aiStep':        return 1.3
    default:              return 1
  }
}

/**
 * Serialize a typed canvas config into n8n node parameters. Returns null for
 * configs with no mapping (baseParams are kept as-is in that case).
 * `rawType` is the node's existing n8n type (if any) — aiStep needs it to
 * know whether it's writing a real OpenAI node's parameters or the JSON body
 * of an httpRequest node that calls Aivory's Zeroclaw backend.
 */
export function configToN8nParameters(config: NodeConfig, rawType?: string | null): Record<string, any> | null {
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
    case 'rssFeed':
      return { url: config.feedUrl }
    case 'slack':
      return {
        resource: config.resource,
        operation: config.operation,
        channel: config.channel,
        text: config.text,
        otherOptions: {},
      }
    case 'gmail':
      return {
        resource: 'message',
        operation: 'send',
        sendTo: config.to,
        subject: config.subject,
        message: config.message,
      }
    case 'aiStep': {
      // Zeroclaw ignores a separate system_prompt field — it must be embedded
      // in the message text (see workflow-builder-architecture memory).
      if (!rawType || rawType === 'n8n-nodes-base.httpRequest') {
        const instruction = [config.systemPrompt, config.whatHappens].filter(Boolean).join('\n\n')
        return {
          method: 'POST',
          sendBody: true,
          specifyBody: 'json',
          jsonBody: JSON.stringify({ message: instruction || config.whatHappens }, null, 2),
        }
      }
      if (rawType === '@n8n/n8n-nodes-langchain.lmChatOpenAi' || rawType === '@n8n/n8n-nodes-langchain.lmChatAnthropic') {
        return { model: { value: config.model }, options: { temperature: config.temperature } }
      }
      if (rawType === '@n8n/n8n-nodes-langchain.agent') {
        // The Agent node itself has no model/temperature — those live on its
        // linked Chat Model sub-node (updated separately, see reactFlowToN8n's
        // sub-node sync pass). `text` is usually an n8n expression referencing
        // upstream JSON — leave it untouched (comes through via baseParams merge).
        return { promptType: 'define', options: { systemMessage: config.systemPrompt || config.whatHappens || '' } }
      }
      // Real n8n-nodes-base.openAi node.
      return {
        resource: 'text',
        operation: 'message',
        modelId: { value: config.model, mode: 'list' },
        messages: {
          values: [
            ...(config.systemPrompt ? [{ content: config.systemPrompt, role: 'system' }] : []),
            { content: config.whatHappens, role: 'user' },
          ],
        },
        options: { temperature: config.temperature },
      }
    }
    default:
      // agent / generic — no direct n8n parameter mapping; keep rawN8n params.
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
    const resolvedType = rawN8n?.type || originalN8nNode?.type || null
    const configParams = config ? configToN8nParameters(config, resolvedType) : null
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
  // Format: { [sourceName]: { main: Array<Array<N8nConnectionTarget>>, ai_languageModel?: ... } }
  edges.forEach((edge) => {
    const sourceName = idToName.get(edge.source) || edge.source
    const targetName = idToName.get(edge.target) || edge.target

    // 'aiSubConnection' edges (Chat Model/Memory/Tool -> Agent) use their own
    // n8n connection type instead of 'main' — see n8nToReactFlow() above.
    const subType = edge.type === 'aiSubConnection' ? (edge.data as any)?.connectionType : undefined
    const connType: 'main' | 'ai_languageModel' | 'ai_memory' | 'ai_tool' = subType || 'main'

    if (!workflow.connections[sourceName]) {
      workflow.connections[sourceName] = {}
    }
    if (!workflow.connections[sourceName][connType]) {
      workflow.connections[sourceName][connType] = []
    }
    const branchArray = workflow.connections[sourceName][connType]!

    // Determine branch index: 0 = true/main, 1 = false/no (only meaningful for 'main')
    const branchIndex = connType === 'main' && edge.sourceHandle === 'out-no' ? 1 : 0

    while (branchArray.length <= branchIndex) {
      branchArray.push([])
    }

    branchArray[branchIndex].push({
      node: targetName,
      type: connType,
      index: 0,
    })
  })

  // Sync the AI Agent's linked Chat Model sub-node when the user edits the
  // Agent's model in the inspector — the model lives on the sub-node's
  // parameters, not the Agent's own parameters.
  const aiLanguageModelEdges = edges.filter(
    (e) => e.type === 'aiSubConnection' && (e.data as any)?.connectionType === 'ai_languageModel'
  )
  aiLanguageModelEdges.forEach((edge) => {
    const agentReactNode = nodes.find((n) => n.id === edge.target)
    const config = agentReactNode?.data.config
    if (!config || config.type !== 'aiStep' || !config.model) return
    const modelNode = workflow.nodes.find((n) => n.id === edge.source)
    if (!modelNode) return
    if (modelNode.type === '@n8n/n8n-nodes-langchain.lmChatAnthropic' || modelNode.type === '@n8n/n8n-nodes-langchain.lmChatOpenAi') {
      // Provider changed in the inspector — swap the sub-node's n8n type too,
      // not just the model value, so the deployed workflow uses the right
      // LangChain Chat Model node.
      modelNode.type = config.provider === 'anthropic'
        ? '@n8n/n8n-nodes-langchain.lmChatAnthropic'
        : '@n8n/n8n-nodes-langchain.lmChatOpenAi'
      modelNode.parameters = { ...modelNode.parameters, model: { value: config.model } }
    }
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
  workflowId?: string,
  linkedModelNode?: N8nNode
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
    // linkedModel is not part of the real n8n schema — it's how we carry the
    // AI Agent's connected Chat Model sub-node params through to the inspector
    // (extractConfigFromNode) without threading the whole graph everywhere.
    rawN8n: linkedModelNode
      ? { ...n8nNode, linkedModel: { type: linkedModelNode.type, parameters: linkedModelNode.parameters } }
      : n8nNode,
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
