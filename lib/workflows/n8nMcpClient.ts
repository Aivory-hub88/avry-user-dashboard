/**
 * n8n-MCP Client (Next.js side)
 * Connects to the self-hosted n8n-MCP server for real-time node schema
 * lookups and workflow validation before pushing to n8n.
 *
 * - Session lifecycle: initialize once, reuse, auto-retry on session error
 * - SSE response parsing
 * - In-memory schema cache (10 min TTL)
 * - Graceful fallback when MCP is unreachable
 */

// n8n-MCP server runs on the VPS. Set N8N_MCP_URL in .env.local to override.
const MCP_URL = process.env.N8N_MCP_URL || 'http://43.156.108.96:3020'
const MCP_AUTH = process.env.N8N_MCP_AUTH_TOKEN || ''
const CACHE_TTL_MS = 10 * 60 * 1000

// ── Types ─────────────────────────────────────────────────────────────────────

export type N8nNodeSchema = {
  nodeType: string
  displayName: string
  version: string
  typeVersion: number
  requiredProperties: Array<{
    name: string
    displayName: string
    type: string
    required: boolean
    default?: unknown
  }>
  commonProperties: Array<unknown>
  metadata: {
    hasCredentials: boolean
    isAITool: boolean
    isTrigger: boolean
    package: string
  }
}

export type N8nValidationResult = {
  valid: boolean
  errors: string[]
  warnings: string[]
  fixes?: Record<string, unknown>
}

export type N8nWorkflowValidationResult = {
  valid: boolean
  errors: Array<{ node: string; message: string }>
  warnings: Array<{ node: string; message: string }>
}

export type N8nNodeSearchResult = {
  nodeType: string
  displayName: string
  description: string
  category: string
}

// ── Session state ─────────────────────────────────────────────────────────────

let sessionId: string | null = null
let requestCounter = 0

// ── Schema cache ──────────────────────────────────────────────────────────────

const schemaCache = new Map<string, { data: N8nNodeSchema; ts: number }>()

function getCached(key: string): N8nNodeSchema | null {
  const entry = schemaCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    schemaCache.delete(key)
    return null
  }
  return entry.data
}

// ── SSE parser ────────────────────────────────────────────────────────────────

function parseSseResponse(body: string): unknown {
  for (const line of body.split('\n')) {
    if (line.startsWith('data: ')) {
      const json = line.slice(6).trim()
      if (!json || json === '[DONE]') continue
      try {
        const envelope = JSON.parse(json)
        if (envelope.result?.content?.[0]?.text) {
          return JSON.parse(envelope.result.content[0].text)
        }
        if (envelope.result && !envelope.result.content) return envelope.result
      } catch { /* skip */ }
    }
  }
  return null
}

// ── Low-level request ─────────────────────────────────────────────────────────

async function mcpRequest(method: string, params: Record<string, unknown>, retry = true): Promise<unknown> {
  const id = ++requestCounter
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  }
  if (MCP_AUTH) headers['Authorization'] = `Bearer ${MCP_AUTH}`
  if (sessionId) headers['mcp-session-id'] = sessionId

  const res = await fetch(`${MCP_URL}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal: AbortSignal.timeout(15000),
  })

  const newSession = res.headers.get('mcp-session-id')
  if (newSession) sessionId = newSession

  const text = await res.text()

  if (!res.ok) {
    if (retry && (res.status === 401 || res.status === 403 || text.includes('session'))) {
      sessionId = null
      await initialize()
      return mcpRequest(method, params, false)
    }
    throw new Error(`MCP ${method} failed (${res.status}): ${text.slice(0, 256)}`)
  }

  const ct = res.headers.get('content-type') || ''
  if (ct.includes('text/event-stream')) return parseSseResponse(text)
  try {
    const json = JSON.parse(text)
    if (json.result?.content?.[0]?.text) return JSON.parse(json.result.content[0].text)
    return json.result || json
  } catch {
    return parseSseResponse(text)
  }
}

// ── Session ───────────────────────────────────────────────────────────────────

async function initialize() {
  if (sessionId) return
  console.log('[n8nMcpClient] Initializing MCP session...')
  await mcpRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'aivory-console', version: '1.0.0' },
  }, false)
  console.log('[n8nMcpClient] Session established:', sessionId)
}

async function ensureSession() {
  if (!sessionId) await initialize()
}

async function callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  await ensureSession()
  return mcpRequest('tools/call', { name: toolName, arguments: args })
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getNodeSchema(nodeType: string): Promise<N8nNodeSchema | null> {
  const cached = getCached(nodeType)
  if (cached) return cached

  try {
    const result = await callTool('get_node_schema', { nodeType }) as N8nNodeSchema
    if (result) schemaCache.set(nodeType, { data: result, ts: Date.now() })
    return result
  } catch (err) {
    console.warn(`[n8nMcpClient] getNodeSchema(${nodeType}) failed:`, (err as Error).message)
    return null
  }
}

export async function validateNodeConfig(
  nodeType: string,
  config: Record<string, unknown>,
  mode: 'minimal' | 'full' = 'full'
): Promise<N8nValidationResult> {
  try {
    return await callTool('validate_node_config', { nodeType, config, mode }) as N8nValidationResult
  } catch (err) {
    console.warn(`[n8nMcpClient] validateNodeConfig failed:`, (err as Error).message)
    return { valid: true, errors: [], warnings: ['MCP validation unavailable'] }
  }
}

export async function validateWorkflow(
  workflow: Record<string, unknown>
): Promise<N8nWorkflowValidationResult> {
  try {
    return await callTool('validate_workflow', { workflow }) as N8nWorkflowValidationResult
  } catch (err) {
    console.warn('[n8nMcpClient] validateWorkflow failed, skipping:', (err as Error).message)
    return { valid: true, errors: [], warnings: [{ node: '*', message: 'MCP validation unavailable' }] }
  }
}

export async function searchNodes(query: string): Promise<N8nNodeSearchResult[]> {
  try {
    return await callTool('search_nodes', { query }) as N8nNodeSearchResult[]
  } catch (err) {
    console.warn(`[n8nMcpClient] searchNodes failed:`, (err as Error).message)
    return []
  }
}
