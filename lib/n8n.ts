/**
 * Canonical n8n type definitions.
 * Used everywhere we talk to the n8n API — POST /workflows, PUT /workflows/:id, etc.
 *
 * Key rule: connections are keyed by node NAME (not ID).
 * Position is a [x, y] tuple as required by the n8n API.
 */

// ── Core node type ────────────────────────────────────────────────────────────

export interface N8nNode {
  id: string
  name: string
  type: string
  typeVersion: number
  /** n8n requires position as [x, y] tuple */
  position: [number, number]
  parameters: Record<string, any>
  disabled?: boolean
  notes?: string
  credentials?: Record<string, any>
  // Retry/error-handling — sibling fields on the node object, not nested
  // inside `parameters` (matches n8n's own model).
  retryOnFail?: boolean
  maxTries?: number
  waitBetweenTries?: number
  onError?: 'stopWorkflow' | 'continueRegularOutput' | 'continueErrorOutput'
}

// ── Connections ───────────────────────────────────────────────────────────────
// Keyed by SOURCE node NAME (not ID).
// Each key maps to an object keyed by connection type, each holding an array
// of output branches (each branch an array of connection targets).
// 'main' is the regular data-flow connection. The `ai_*` types are how
// LangChain sub-nodes (Chat Model, Memory, Tool) feed into an AI Agent node —
// the sub-node is the connection SOURCE even though it renders below/behind
// the Agent it feeds.

export type N8nConnectionType = 'main' | 'ai_languageModel' | 'ai_memory' | 'ai_tool'

export interface N8nConnectionTarget {
  node: string   // target node NAME
  type: N8nConnectionType
  index: number
}

export interface N8nConnections {
  [sourceNodeName: string]: {
    main?: Array<Array<N8nConnectionTarget>>
    ai_languageModel?: Array<Array<N8nConnectionTarget>>
    ai_memory?: Array<Array<N8nConnectionTarget>>
    ai_tool?: Array<Array<N8nConnectionTarget>>
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

export interface N8nSettings {
  timezone?: string
  saveDataErrorExecution?: string
  saveDataSuccessExecution?: string
  executionOrder?: string
}

// ── Full workflow ─────────────────────────────────────────────────────────────
// This is the shape we send to POST /api/v1/workflows and PUT /api/v1/workflows/:id.
// The "id" field is only present on responses from n8n (not on create payloads).

export interface N8nWorkflow {
  id?: string
  name: string
  active?: boolean
  nodes: N8nNode[]
  connections: N8nConnections
  settings?: N8nSettings
  tags?: any[]
  description?: string
  createdAt?: string
  updatedAt?: string
}

// ── Execution ─────────────────────────────────────────────────────────────────

export interface N8nExecution {
  id: string
  workflowId: string
  status: 'success' | 'error' | 'running'
  startTime: string
  endTime?: string
  error?: string
  data?: Record<string, any>
}

// ── Error ─────────────────────────────────────────────────────────────────────

export class N8nError extends Error {
  constructor(
    public message: string,
    public status: number,
    public code?: string
  ) {
    super(message)
    this.name = 'N8nError'
  }
}

// ── Validation helper ─────────────────────────────────────────────────────────

/**
 * Validate that a workflow object is structurally valid before sending to n8n.
 * Throws with a descriptive message if invalid.
 */
export function validateN8nWorkflow(wf: N8nWorkflow): void {
  if (!wf.name?.trim()) throw new Error('Workflow must have a name')
  if (!Array.isArray(wf.nodes) || wf.nodes.length === 0) throw new Error('Workflow must have at least one node')
  if (typeof wf.connections !== 'object') throw new Error('Workflow must have a connections object')

  const nodeNames = new Set(wf.nodes.map((n) => n.name))

  // Every connection source must exist as a node name
  for (const sourceName of Object.keys(wf.connections)) {
    if (!nodeNames.has(sourceName)) {
      throw new Error(`Connection source "${sourceName}" does not match any node name`)
    }
    // Every connection target must also exist
    const branches = wf.connections[sourceName].main ?? []
    for (const branch of branches) {
      for (const target of branch) {
        if (!nodeNames.has(target.node)) {
          throw new Error(`Connection target "${target.node}" (from "${sourceName}") does not match any node name`)
        }
      }
    }
  }
}

// ── API client helpers ────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 5000
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && (error.name === 'AbortError' || error.message === 'AbortError')) {
      throw new N8nError('Request timeout', 504, 'TIMEOUT')
    }
    throw error
  }
}

export async function getWorkflow(id: string): Promise<N8nWorkflow> {
  const CACHE_KEY = 'aivory_workflow_cache'
  try {
    const response = await fetchWithTimeout(`/api/n8n/workflow/${id}`)
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new N8nError(error.error || 'Failed to fetch workflow', response.status)
    }
    const data = await response.json()
    const workflow = data.data || data.workflow || data

    if (typeof window !== 'undefined' && window.localStorage) {
      let shouldWrite = true
      const existing = window.localStorage.getItem(CACHE_KEY)
      if (existing) {
        try {
          const cachedData = JSON.parse(existing)
          if (cachedData.localChanges) {
            shouldWrite = false
          }
        } catch (_) {}
      }
      if (shouldWrite) {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify({
          workflow,
          timestamp: Date.now()
        }))
      }
    }

    return workflow
  } catch (error) {
    if (typeof window !== 'undefined' && window.localStorage) {
      const cached = window.localStorage.getItem(CACHE_KEY)
      if (cached) {
        try {
          const cachedData = JSON.parse(cached)
          if (cachedData.workflow && (!id || cachedData.workflow.id === id)) {
            return cachedData.workflow
          }
        } catch (_) {}
      }
    }
    throw error
  }
}

export async function updateWorkflow(id: string, workflow: N8nWorkflow): Promise<N8nWorkflow> {
  const CACHE_KEY = 'aivory_workflow_cache'
  const response = await fetchWithTimeout(`/api/n8n/workflow/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workflow),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new N8nError(error.error || 'Failed to update workflow', response.status)
  }
  const data = await response.json()
  const savedWorkflow = data.data || data.workflow || data

  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({
      workflow: savedWorkflow,
      timestamp: Date.now()
    }))
  }

  return savedWorkflow
}

export async function activateWorkflow(id: string): Promise<void> {
  const response = await fetchWithTimeout(`/api/n8n/workflow/${id}/activate`, { method: 'POST' })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new N8nError(error.error || 'Failed to activate workflow', response.status)
  }
}

export async function deactivateWorkflow(id: string): Promise<void> {
  const response = await fetchWithTimeout(`/api/n8n/workflow/${id}/deactivate`, { method: 'POST' })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new N8nError(error.error || 'Failed to deactivate workflow', response.status)
  }
}

export async function getExecutions(workflowId: string, limit = 20): Promise<N8nExecution[]> {
  const params = new URLSearchParams({ workflowId, limit: limit.toString() })
  const response = await fetchWithTimeout(`/api/n8n/workflow/${workflowId}/executions?${params}`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new N8nError(error.error || 'Failed to fetch executions', response.status)
  }
  const data = await response.json()
  return data.data || data.executions || []
}

