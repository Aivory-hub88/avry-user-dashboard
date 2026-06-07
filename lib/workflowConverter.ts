/**
 * Smart workflow conversion library
 * Maps Aivory workflow steps to correct n8n native nodes with pre-filled parameters.
 *
 * Uses nodeMapper engine for universal intent detection:
 *   detectNodeIntent() → identifies step intent (email, http, ai, respond, etc.)
 *   mapIntentToN8nNode() → builds the correct n8n node with proper parameters
 *
 * Trigger node always uses Webhook with auto-generated path.
 */

import { detectNodeIntent, mapIntentToN8nNode } from '@/lib/workflows/nodeMapper'
import type { NodeIntent, MapContext } from '@/lib/workflows/nodeMapper'

interface WorkflowStep {
  step: number
  action: string
  tool: string
  output: string
  inputs?: { url?: string; [key: string]: any }
}

interface AivoryWorkflow {
  workflow_id: string
  title: string
  trigger?: string
  trigger_description?: string
  steps: WorkflowStep[]
  company_name?: string
  diagnostic_score?: number
  created_at?: string
  tags?: string[]
}

interface N8nNode {
  name: string
  type: string
  typeVersion: number
  position: [number, number]
  parameters: Record<string, any>
  id?: string
}

interface N8nWorkflow {
  name: string
  nodes: N8nNode[]
  connections: Record<string, any>
  settings: Record<string, any>
  versionId?: string
  tags?: string[]
}

/**
 * Generate a UUID v4-like ID for n8n nodes (n8n requires UUID format)
 */
function generateNodeId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/**
 * Convert Aivory workflow to n8n format using the nodeMapper engine.
 *
 * Each step is classified via detectNodeIntent() then mapped to a fully
 * configured n8n node via mapIntentToN8nNode().
 */
export function convertToN8nWorkflow(workflow: AivoryWorkflow): N8nWorkflow {
  const nodes: N8nNode[] = []
  const connections: Record<string, any> = {}

  // 1. Trigger node — detect schedule vs webhook based on trigger text
  const triggerText = (workflow.trigger || '').toLowerCase()
  const isSchedule = /jam|hari|menit|detik|hour|day|minute|second|schedule|cron|setiap|every|interval|waktu|berkala/.test(triggerText)

  // Parse hour interval from trigger text if schedule
  const hourMatch = triggerText.match(/(\d+)\s*jam/)
  const hourInterval = hourMatch ? parseInt(hourMatch[1]) : 24

  const triggerNode: N8nNode = isSchedule ? {
    id: generateNodeId(),
    name: 'Schedule Trigger',
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2,
    position: [250, 300],
    parameters: {
      rule: {
        interval: [{ field: 'hours', hoursInterval: hourInterval }]
      }
    },
  } : {
    id: generateNodeId(),
    name: 'Webhook Trigger',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 1,
    position: [250, 300],
    parameters: {
      httpMethod: 'POST',
      path: workflow.workflow_id ? `aivory-${workflow.workflow_id}` : `aivory-${Date.now()}`,
      responseMode: 'responseNode',
    },
  }
  nodes.push(triggerNode)

  // 2. Step nodes — classified via nodeMapper engine
  let aiNodeCount = 0
  const nodeNames: string[] = []
  const stepCount = workflow.steps.length

  workflow.steps.forEach((step, i) => {
    const isLast = i === stepCount - 1

    // Detect intent — last step defaults to 'respond' unless it has a specific channel intent
    let intent: NodeIntent = detectNodeIntent(step.action, step.tool)
    console.log(`[workflowConverter] Step ${i}: action="${step.action}" tool="${step.tool}" → intent="${intent}" isLast=${isLast}`)
    // Only override last step to respondToWebhook for webhook-triggered workflows.
    // Scheduled workflows have no webhook to respond to — keep the detected intent.
    if (isLast && !isSchedule && intent !== 'respond' && intent !== 'filter' && intent !== 'email' && intent !== 'messaging') {
      console.log(`[workflowConverter] Step ${i}: overriding intent from "${intent}" to "respond" (last step, webhook workflow)`)
      intent = 'respond'
    }

    const ctx: MapContext = { stepIndex: i, aiNodeCount, isLast }
    const stepNode = mapIntentToN8nNode(intent, step, ctx)
    console.log(`[workflowConverter] Step ${i}: mapped to n8n type="${stepNode.type}" typeVersion=${stepNode.typeVersion}`)

    // Track AI nodes for input expression selection
    if (intent === 'ai') aiNodeCount++

    nodes.push(stepNode)

    // Connect previous node → this node using tracked names
    const prevNodeName = i === 0 ? triggerNode.name : nodeNames[i - 1]
    connections[prevNodeName] = {
      main: [[{ node: stepNode.name, type: 'main', index: 0 }]],
    }
    nodeNames.push(stepNode.name)
  })

  return {
    name: workflow.title,
    nodes,
    connections,
    settings: { executionOrder: 'v1' },
    versionId: generateNodeId(),
    tags: workflow.tags || [],
  }
}

/**
 * Generate a download-ready n8n JSON blob and trigger browser download
 */
export function downloadN8nJSON(workflow: AivoryWorkflow, filename?: string): void {
  const n8nWorkflow = convertToN8nWorkflow(workflow)
  const blob = new Blob([JSON.stringify(n8nWorkflow, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `${workflow.title.replace(/\s+/g, '-').toLowerCase()}-n8n.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Convert workflow to n8n JSON string (for API calls, no browser needed)
 */
export function convertToN8nJsonString(workflow: AivoryWorkflow): string {
  const n8nWorkflow = convertToN8nWorkflow(workflow)
  return JSON.stringify(n8nWorkflow, null, 2)
}
