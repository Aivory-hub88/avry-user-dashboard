/**
 * n8n REST API client — explicit two-step activation.
 *
 * Step 1: POST /api/v1/workflows          (active: false) → get n8n workflow id
 * Step 2: POST /api/v1/workflows/:id/activate
 *
 * Every n8n call reads the response body as text first so we never lose
 * the error message, even when n8n returns non-JSON on failure.
 */
import type { AivoryWorkflowSpec } from '@/types/workflow'
import { convertToN8nWorkflow } from '@/lib/workflowConverter'
import { validateWorkflow as mcpValidateWorkflow } from '@/lib/workflows/n8nMcpClient'
import type { N8nWorkflowValidationResult } from '@/lib/workflows/n8nMcpClient'

// ── Config ────────────────────────────────────────────────────────────────────

function getConfig() {
  // Support N8N_BASE_URL (primary), N8N_API_URL, N8N_URL, or hardcoded fallback
  // FIX #1: Default port changed from 3003 (Zeroclaw) → 5678 (n8n REST API)
  const raw = (
    process.env.N8N_BASE_URL ||
    process.env.N8N_API_URL ||
    process.env.N8N_URL ||
    ''
  ).replace(/\/$/, '')
  // Fail hard when unset — never fall back to a hardcoded host (the old
  // fallback pointed at the retired, compromised VPS).
  if (!raw) throw new Error('N8N_BASE_URL is not configured')
  const key = process.env.N8N_API_KEY
  if (!key) throw new Error('N8N_API_KEY is not configured')
  return {
    apiBase: `${raw}/api/v1`,
    uiBase: raw,
    key,
  }
}

function authHeaders(key: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-N8N-API-KEY': key,
  }
}

// ── Core fetch helper ─────────────────────────────────────────────────────────

/**
 * Make a fetch call to n8n, read the body as text, log everything, and either
 * return the parsed JSON or throw with the raw body as the error message.
 *
 * @param label   Short label used in log lines and error messages (e.g. "create draft")
 * @param url     Full URL
 * @param options fetch RequestInit
 */
async function n8nFetch(label: string, url: string, options: RequestInit): Promise<unknown> {
  console.log(`[n8nClient] ${label} → ${options.method ?? 'GET'} ${url}`)
  if (options.body) {
    // Log payload (truncated to 2 KB to avoid flooding logs)
    const preview = String(options.body).slice(0, 2048)
    console.log(`[n8nClient] ${label} payload:`, preview)
  }

  const res = await fetch(url, options)
  const text = await res.text()

  console.log(`[n8nClient] ${label} response: status=${res.status}`, text.slice(0, 1024))

  if (!res.ok) {
    const msg = text.trim().length > 0
      ? `n8n ${label} failed (${res.status}): ${text}`
      : `n8n ${label} failed (${res.status} ${res.statusText})`
    throw new Error(msg)
  }

  try {
    return text ? JSON.parse(text) : null
  } catch {
    // n8n returned 2xx but non-JSON — return raw text
    return text
  }
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface N8nWorkflowResponse {
  id: string
  name: string
  active: boolean
  nodes?: Array<{
    type?: string
    parameters?: { path?: string; [key: string]: unknown }
    [key: string]: unknown
  }>
  [key: string]: unknown
}

// ── Explicit credentials interface (for user-provided creds) ──────────────────

export interface N8nConnectionParams {
  instanceUrl: string   // Base URL of the user's n8n instance
  apiKey: string        // User's n8n API key
}

// ── URL helpers ───────────────────────────────────────────────────────────────

/**
 * Build the n8n REST API URL for a specific workflow.
 * Use this anywhere you need to call the n8n API for a known workflow.
 */
export function getN8nWorkflowApiUrl(n8nWorkflowId: string): string {
  const { apiBase } = getConfig()
  return `${apiBase}/workflows/${n8nWorkflowId}`
}

/**
 * Build the n8n UI link for a workflow (for "View in n8n" buttons).
 */
export function getN8nWorkflowUiUrl(n8nWorkflowId: string): string {
  const { uiBase } = getConfig()
  return `${uiBase}/workflow/${n8nWorkflowId}`
}

/**
 * Build the full webhook URL from a stored relative path.
 * e.g. n8nWebhookPath="/webhook/abc-123" → "<bridge-url>/webhook/abc-123"
 */
export function getN8nWebhookUrl(n8nWebhookPath: string): string {
  const { uiBase } = getConfig()
  return `${uiBase}${n8nWebhookPath}`
}

// ── Payload builder ───────────────────────────────────────────────────────────

function buildPayload(spec: AivoryWorkflowSpec) {
  return convertToN8nWorkflow({
    workflow_id: spec.id,
    title: spec.title,
    trigger: spec.trigger,
    steps: spec.steps,
    company_name: spec.company_name,
    created_at: spec.createdAt,
  })
}

/**
 * Extract the webhook path from an n8n workflow response.
 * n8n stores the webhook path in the webhook trigger node's parameters.path.
 * Returns e.g. "/webhook/0f137ee4-ef4a-43f1-96d9-e9ea3488805b" or null.
 */
function extractWebhookPath(workflow: N8nWorkflowResponse): string | null {
  if (!workflow.nodes) return null
  for (const node of workflow.nodes) {
    if (
      node.type === 'n8n-nodes-base.webhook' &&
      typeof node.parameters?.path === 'string'
    ) {
      const path = node.parameters.path
      // Normalize: ensure it starts with /webhook/
      return path.startsWith('/') ? path : `/webhook/${path}`
    }
  }
  return null
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Step 1 — Create a new workflow in n8n as a draft (active: false).
 * Throws with the raw n8n body if the request fails.
 */
export async function createN8nWorkflow(spec: AivoryWorkflowSpec): Promise<N8nWorkflowResponse> {
  const { apiBase, key } = getConfig()
  const payload = buildPayload(spec)

  const result = await n8nFetch(
    'create draft',
    `${apiBase}/workflows`,
    {
      method: 'POST',
      headers: authHeaders(key),
      body: JSON.stringify(payload),
    }
  ) as N8nWorkflowResponse

  if (!result?.id) {
    throw new Error(`n8n create draft succeeded but returned no workflow id. Body: ${JSON.stringify(result)}`)
  }

  console.log(`[n8nClient] Draft created in n8n: id=${result.id}`)
  return result
}

/**
 * Update an existing n8n workflow (keeps it as draft).
 */
export async function updateN8nWorkflow(
  n8nId: string,
  spec: AivoryWorkflowSpec
): Promise<N8nWorkflowResponse> {
  const { apiBase, key } = getConfig()
  const payload = buildPayload(spec)

  const result = await n8nFetch(
    'update draft',
    `${apiBase}/workflows/${n8nId}`,
    {
      method: 'PUT',
      headers: authHeaders(key),
      body: JSON.stringify(payload),
    }
  ) as N8nWorkflowResponse

  console.log(`[n8nClient] Draft updated in n8n: id=${result.id}`)
  return result
}

/**
 * Step 2 — Activate (or deactivate) an existing n8n workflow.
 * n8n REST API v1 uses POST /workflows/:id/activate and POST /workflows/:id/deactivate.
 */
export async function setN8nWorkflowActive(n8nId: string, active: boolean): Promise<void> {
  const { apiBase, key } = getConfig()
  const action = active ? 'activate' : 'deactivate'

  await n8nFetch(
    action,
    `${apiBase}/workflows/${n8nId}/${action}`,
    {
      method: 'POST',
      headers: authHeaders(key),
    }
  )

  console.log(`[n8nClient] Workflow ${action}d: id=${n8nId}`)
}

/**
 * Full deploy-and-activate sequence.
 *
 * 1. If spec has no n8n_workflow_id → POST /workflows (create draft)
 *    - On success: call onDraftCreated(n8nId, n8nUrl, n8nWebhookPath) so the caller
 *      can persist the IDs immediately, before activation.
 *    - On failure: throw — do NOT proceed.
 *
 * 2. POST /workflows/:id/activate
 *    - On failure: throw — caller must NOT mark Aivory workflow as active.
 *
 * FIX #3: onDraftCreated errors are NO LONGER swallowed.
 * If persisting the draft ID fails, we throw immediately and skip activation.
 * This prevents orphaned workflows in n8n that Aivory can never reference again.
 */
export async function deployAndActivate(
  spec: AivoryWorkflowSpec,
  onDraftCreated?: (n8nId: string, n8nUrl: string, n8nWebhookPath: string | null) => void
): Promise<{ n8nWorkflowId: string; n8nWorkflowUrl: string; n8nWebhookPath: string | null }> {
  const { uiBase } = getConfig()

  // ── Step 0: validate workflow via n8n-MCP (non-blocking) ──────────────────
  const payload = buildPayload(spec)
  try {
    const validation = await mcpValidateWorkflow(payload as unknown as Record<string, unknown>)
    if (!validation.valid && validation.errors.length > 0) {
      console.warn('[n8nClient] MCP validation found issues:', validation.errors)
      // Log but don't block — let n8n be the final arbiter
    }
  } catch (e) {
    console.warn('[n8nClient] MCP validation skipped (non-fatal):', e)
  }

  // ── Step 1: create or update draft ──────────────────────────────────────────
  let n8nId: string
  let n8nWebhookPath: string | null = null

  if (spec.n8n_workflow_id) {
    console.log(`[n8nClient] deployAndActivate: spec already has n8n_workflow_id=${spec.n8n_workflow_id}, updating`)
    const updated = await updateN8nWorkflow(spec.n8n_workflow_id, spec)
    n8nId = updated.id
    n8nWebhookPath = extractWebhookPath(updated)
  } else {
    console.log(`[n8nClient] deployAndActivate: no n8n_workflow_id on spec, creating new draft`)
    const created = await createN8nWorkflow(spec)
    n8nId = created.id
    n8nWebhookPath = extractWebhookPath(created)
  }

  const n8nWorkflowUrl = `${uiBase}/workflow/${n8nId}`

  if (n8nWebhookPath) {
    console.log(`[n8nClient] deployAndActivate: webhook path=${n8nWebhookPath}`)
  }

  // FIX #3: Persist the draft ID BEFORE activation.
  // If onDraftCreated throws (e.g. DB write fails), we abort here.
  // This prevents a scenario where n8n has an active workflow but Aivory
  // has no record of its ID — making it impossible to deactivate from the UI.
  if (onDraftCreated) {
    // ❌ OLD (bug): errors silently swallowed, orphaned workflows possible
    // try {
    //   onDraftCreated(n8nId, n8nWorkflowUrl, n8nWebhookPath)
    // } catch (e) {
    //   console.warn('[n8nClient] onDraftCreated callback threw (non-fatal):', e)
    // }

    // ✅ NEW: let it throw — caller must fix their DB write before we activate
    onDraftCreated(n8nId, n8nWorkflowUrl, n8nWebhookPath)
  }

  // ── Step 2: activate ─────────────────────────────────────────────────────────
  console.log(`[n8nClient] deployAndActivate: activating n8n workflow id=${n8nId}`)
  await setN8nWorkflowActive(n8nId, true)

  return { n8nWorkflowId: n8nId, n8nWorkflowUrl, n8nWebhookPath }
}


// ── WithCreds variants (user-provided credentials) ────────────────────────────

/**
 * Derive apiBase and uiBase from a user-provided N8nConnectionParams.
 */
function getConnConfig(conn: N8nConnectionParams) {
  const raw = conn.instanceUrl.replace(/\/+$/, '')
  return {
    apiBase: `${raw}/api/v1`,
    uiBase: raw,
    key: conn.apiKey,
  }
}

/**
 * Create a new workflow in n8n as a draft (active: false) using explicit credentials.
 * Same as `createN8nWorkflow` but uses user-provided connection params.
 */
export async function createN8nWorkflowWithCreds(
  spec: AivoryWorkflowSpec,
  conn: N8nConnectionParams
): Promise<N8nWorkflowResponse> {
  const { apiBase, key } = getConnConfig(conn)
  const payload = buildPayload(spec)

  const result = await n8nFetch(
    'create draft (creds)',
    `${apiBase}/workflows`,
    {
      method: 'POST',
      headers: authHeaders(key),
      body: JSON.stringify(payload),
    }
  ) as N8nWorkflowResponse

  if (!result?.id) {
    throw new Error(`n8n create draft succeeded but returned no workflow id. Body: ${JSON.stringify(result)}`)
  }

  console.log(`[n8nClient] Draft created in n8n (creds): id=${result.id}`)
  return result
}

/**
 * Activate (or deactivate) an existing n8n workflow using explicit credentials.
 * Same as `setN8nWorkflowActive` but uses user-provided connection params.
 */
export async function setN8nWorkflowActiveWithCreds(
  n8nId: string,
  active: boolean,
  conn: N8nConnectionParams
): Promise<void> {
  const { apiBase, key } = getConnConfig(conn)
  const action = active ? 'activate' : 'deactivate'

  await n8nFetch(
    `${action} (creds)`,
    `${apiBase}/workflows/${n8nId}/${action}`,
    {
      method: 'POST',
      headers: authHeaders(key),
    }
  )

  console.log(`[n8nClient] Workflow ${action}d (creds): id=${n8nId}`)
}

/**
 * Full deploy-and-activate sequence using explicit user credentials.
 * Same logic as `deployAndActivate` but uses user-provided connection params
 * instead of reading from process.env.
 *
 * 1. Create draft (or update if spec.n8n_workflow_id exists)
 * 2. Call onDraftCreated if provided (must succeed before activation)
 * 3. Activate the workflow
 */
export async function deployAndActivateWithCreds(
  spec: AivoryWorkflowSpec,
  conn: N8nConnectionParams,
  onDraftCreated?: (n8nId: string, n8nUrl: string, n8nWebhookPath: string | null) => void
): Promise<{ n8nWorkflowId: string; n8nWorkflowUrl: string; n8nWebhookPath: string | null }> {
  const { apiBase, uiBase, key } = getConnConfig(conn)

  // ── Step 0: validate workflow via n8n-MCP (non-blocking) ──────────────────
  const payload = buildPayload(spec)
  try {
    const validation = await mcpValidateWorkflow(payload as unknown as Record<string, unknown>)
    if (!validation.valid && validation.errors.length > 0) {
      console.warn('[n8nClient] MCP validation found issues:', validation.errors)
    }
  } catch (e) {
    console.warn('[n8nClient] MCP validation skipped (non-fatal):', e)
  }

  // ── Step 1: create or update draft ──────────────────────────────────────────
  let n8nId: string
  let n8nWebhookPath: string | null = null

  if (spec.n8n_workflow_id) {
    console.log(`[n8nClient] deployAndActivateWithCreds: updating existing n8n_workflow_id=${spec.n8n_workflow_id}`)
    const result = await n8nFetch(
      'update draft (creds)',
      `${apiBase}/workflows/${spec.n8n_workflow_id}`,
      {
        method: 'PUT',
        headers: authHeaders(key),
        body: JSON.stringify(payload),
      }
    ) as N8nWorkflowResponse
    n8nId = result.id
    n8nWebhookPath = extractWebhookPath(result)
  } else {
    console.log(`[n8nClient] deployAndActivateWithCreds: creating new draft`)
    const created = await createN8nWorkflowWithCreds(spec, conn)
    n8nId = created.id
    n8nWebhookPath = extractWebhookPath(created)
  }

  const n8nWorkflowUrl = `${uiBase}/workflow/${n8nId}`

  if (n8nWebhookPath) {
    console.log(`[n8nClient] deployAndActivateWithCreds: webhook path=${n8nWebhookPath}`)
  }

  // Persist the draft ID BEFORE activation.
  // If onDraftCreated throws, we abort — prevents orphaned workflows.
  if (onDraftCreated) {
    onDraftCreated(n8nId, n8nWorkflowUrl, n8nWebhookPath)
  }

  // ── Step 2: activate ─────────────────────────────────────────────────────────
  console.log(`[n8nClient] deployAndActivateWithCreds: activating n8n workflow id=${n8nId}`)
  await setN8nWorkflowActiveWithCreds(n8nId, true, conn)

  return { n8nWorkflowId: n8nId, n8nWorkflowUrl, n8nWebhookPath }
}

/**
 * Fetch a workflow's current n8n JSON using explicit user credentials.
 * Backs GET /api/n8n/workflow/[id] — WorkflowCanvas.tsx loads an ACTIVE
 * workflow's canvas straight from n8n (rather than Aivory's own canvas
 * store) via this exact route.
 */
export async function getWorkflowWithCreds(
  conn: N8nConnectionParams,
  n8nWorkflowId: string
): Promise<N8nWorkflowResponse> {
  const { apiBase, key } = getConnConfig(conn)
  return await n8nFetch(
    'get workflow (creds)',
    `${apiBase}/workflows/${n8nWorkflowId}`,
    { method: 'GET', headers: authHeaders(key) }
  ) as N8nWorkflowResponse
}

/**
 * Overwrite a workflow's n8n JSON using explicit user credentials.
 * Backs PUT /api/n8n/workflow/[id] — WorkflowCanvas.tsx's "Save" action for
 * an ACTIVE workflow (handleSave) writes back through this exact route.
 */
export async function updateWorkflowWithCreds(
  conn: N8nConnectionParams,
  n8nWorkflowId: string,
  workflow: Record<string, unknown>
): Promise<N8nWorkflowResponse> {
  const { apiBase, key } = getConnConfig(conn)
  return await n8nFetch(
    'update workflow (creds)',
    `${apiBase}/workflows/${n8nWorkflowId}`,
    { method: 'PUT', headers: authHeaders(key), body: JSON.stringify(workflow) }
  ) as N8nWorkflowResponse
}

/**
 * List recent executions for a workflow using explicit user credentials.
 * Backs GET /api/n8n/workflow/[id]/executions (Execution Logs tab).
 */
export interface N8nExecutionSummary {
  id: string
  workflowId?: string
  status?: string
  startedAt?: string
  stoppedAt?: string
  finished?: boolean
  mode?: string
  [key: string]: unknown
}

export async function getExecutionsWithCreds(
  conn: N8nConnectionParams,
  n8nWorkflowId: string,
  limit = 20
): Promise<N8nExecutionSummary[]> {
  const { apiBase, key } = getConnConfig(conn)
  const url = `${apiBase}/executions?workflowId=${encodeURIComponent(n8nWorkflowId)}&limit=${encodeURIComponent(String(limit))}`

  const result = await n8nFetch('list executions (creds)', url, {
    method: 'GET',
    headers: authHeaders(key),
  }) as { data?: N8nExecutionSummary[] } | N8nExecutionSummary[] | null

  if (Array.isArray(result)) return result
  return result?.data ?? []
}

/**
 * Fetch ONE execution's full per-node input/output data using explicit user
 * credentials. Unlike getExecutionsWithCreds() (list summaries only), this
 * is the raw material for fixture capture (lib/workflows/versionRepository.ts's
 * sibling, dashboard.workflow_fixtures) — n8n's `includeData=true` returns
 * each node's actual runData, not just the execution's status/timestamps.
 */
export interface N8nExecutionDetail extends N8nExecutionSummary {
  data?: unknown
  [key: string]: unknown
}

export async function getExecutionDetailWithCreds(
  conn: N8nConnectionParams,
  executionId: string
): Promise<N8nExecutionDetail> {
  const { apiBase, key } = getConnConfig(conn)
  const url = `${apiBase}/executions/${encodeURIComponent(executionId)}?includeData=true`

  const result = await n8nFetch('get execution detail (creds)', url, {
    method: 'GET',
    headers: authHeaders(key),
  }) as N8nExecutionDetail

  return result
}

// ── Error classification helper ───────────────────────────────────────────────

/**
 * Classify an n8n API error into a structured response suitable for the activate route.
 *
 * - Network errors (TypeError, ECONNREFUSED, DNS failures) → INSTANCE_UNREACHABLE
 * - HTTP 401/403 → INVALID_CREDENTIALS
 * - All other errors → DEPLOYMENT_FAILED
 */
export function classifyN8nError(error: unknown, instanceUrl: string): {
  status: number
  code: string
  message: string
} {
  // Network-level errors (fetch throws TypeError for network failures)
  if (error instanceof TypeError) {
    return {
      status: 502,
      code: 'INSTANCE_UNREACHABLE',
      message: `Cannot reach n8n at ${instanceUrl} — verify the URL is correct`,
    }
  }

  // Check for ECONNREFUSED or similar system errors
  if (
    error &&
    typeof error === 'object' &&
    'cause' in error &&
    (error as { cause?: { code?: string } }).cause?.code === 'ECONNREFUSED'
  ) {
    return {
      status: 502,
      code: 'INSTANCE_UNREACHABLE',
      message: `Cannot reach n8n at ${instanceUrl} — connection refused`,
    }
  }

  // HTTP auth errors — n8nFetch throws Error with status code in the message
  if (error instanceof Error) {
    const msg = error.message
    if (msg.includes('(401)') || msg.includes('(403)')) {
      return {
        status: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Authentication failed — check your n8n API key',
      }
    }
  }

  // Fallback: deployment failed
  return {
    status: 502,
    code: 'DEPLOYMENT_FAILED',
    message: error instanceof Error
      ? `n8n rejected the workflow: ${error.message}`
      : `n8n rejected the workflow: ${String(error)}`,
  }
}
