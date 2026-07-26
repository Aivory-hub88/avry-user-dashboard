import { NextRequest, NextResponse } from 'next/server'
import { normalizeN8nBaseUrl } from '@/lib/workflows/credentialStore'
import { getAuthUser } from '@/lib/serverAuth'

/**
 * POST /api/workflows/activate
 * Deploy + activate a workflow into the user's OWN n8n instance, using the
 * n8n URL + API key they supplied (we never store these server-side).
 * Body:   { workflow_id, workflow_data, n8n_instance_url, n8n_api_key }
 * Returns { success, n8n_workflow_id? } | { success:false, code }
 */
export const runtime = 'nodejs'
export const maxDuration = 60

function buildN8nWorkflow(wfData: any, workflowId: string) {
  const existing = wfData?.workflow_json || wfData?.n8n
  if (existing && Array.isArray(existing.nodes)) {
    return {
      name: existing.name || wfData?.name || `Aivory Workflow ${workflowId}`,
      nodes: existing.nodes,
      connections: existing.connections || {},
      settings: existing.settings || {},
    }
  }
  return {
    name: wfData?.name || `Aivory Workflow ${workflowId}`,
    nodes: Array.isArray(wfData?.nodes) && wfData.nodes.length
      ? wfData.nodes
      : [
          {
            id: 'manual-trigger',
            name: 'When clicking "Execute workflow"',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [240, 300],
            parameters: {},
          },
        ],
    connections: wfData?.connections || {},
    settings: {},
  }
}

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 })
  }

  // ── Credential source ────────────────────────────────────────────────────
  // Normally the caller supplies their own n8n (bring-your-own; we never store
  // those server-side). Superadmins may instead deploy straight into Aivory's
  // own self-hosted n8n for battle-testing — the instance's API key stays in
  // server env and is never sent to, or accepted from, the browser.
  const useAivoryInstance = body?.use_aivory_instance === true

  let url: string
  let apiKey: string
  // Browser-reachable base for the "open in n8n" link. The internal service
  // address (http://n8n:5678) is fine for server-side API calls but useless as
  // a link, so the public host is configured separately.
  let publicBase: string

  if (useAivoryInstance) {
    let authUser
    try {
      authUser = getAuthUser(req)
    } catch {
      return NextResponse.json(
        { success: false, code: 'SERVER_MISCONFIGURED', message: 'Authentication is not configured on this server' },
        { status: 500 },
      )
    }
    // Gate on the cryptographically verified JWT claim — never on a flag the
    // client could set for itself.
    if (!authUser) {
      return NextResponse.json(
        { success: false, code: 'UNAUTHENTICATED', message: 'Sign in to use the Aivory test instance' },
        { status: 401 },
      )
    }
    if (authUser.account_type !== 'superadmin') {
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', message: 'The Aivory test instance is restricted to superadmins' },
        { status: 403 },
      )
    }

    const envUrl = (process.env.N8N_BASE_URL ?? '').trim()
    const envKey = (process.env.N8N_API_KEY ?? '').trim()
    if (!envUrl || !envKey) {
      return NextResponse.json(
        { success: false, code: 'INSTANCE_NOT_CONFIGURED', message: 'The Aivory n8n instance is not configured on this server' },
        { status: 503 },
      )
    }
    url = normalizeN8nBaseUrl(envUrl).replace(/\/$/, '')
    apiKey = envKey
    publicBase = (process.env.N8N_PUBLIC_URL ?? '').trim().replace(/\/$/, '') || url
  } else {
    // Normalise defensively: this used to only strip a trailing slash, so a
    // credential saved before the modal started trimming (or one written by any
    // other caller) could still carry an editor path + query — which turned
    // `${url}/api/v1/workflows` into a 404 against n8n's SPA router.
    const rawUrl = (body?.n8n_instance_url ?? '').toString()
    url = normalizeN8nBaseUrl(rawUrl).replace(/\/$/, '')
    apiKey = (body?.n8n_api_key ?? '').toString().trim()
    publicBase = url
    if (!url || !apiKey) {
      return NextResponse.json(
        { success: false, code: 'MISSING_CREDS', message: 'n8n URL and API key are required' },
        { status: 400 },
      )
    }
  }

  const workflow = buildN8nWorkflow(body?.workflow_data, (body?.workflow_id ?? '').toString())
  const headers = { 'Content-Type': 'application/json', 'X-N8N-API-KEY': apiKey }

  // 1) create the workflow
  let created: any
  try {
    const res = await fetch(`${url}/api/v1/workflows`, {
      method: 'POST',
      headers,
      body: JSON.stringify(workflow),
      signal: AbortSignal.timeout(20_000),
    })
    if (res.status === 401 || res.status === 403) {
      return NextResponse.json(
        { success: false, code: 'INVALID_CREDS', message: 'n8n rejected the API key' },
        { status: 401 },
      )
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      // A 404 whose body is HTML means we hit n8n's editor SPA, not its REST
      // API — i.e. the base URL is wrong. Saying only "n8n returned 404" sends
      // people hunting for a bad API key instead.
      const isHtml =
        (res.headers.get('content-type') || '').includes('text/html') ||
        txt.trimStart().startsWith('<')
      if (res.status === 404 && isHtml) {
        return NextResponse.json(
          {
            success: false,
            code: 'BAD_INSTANCE_URL',
            message:
              `No n8n API found at ${url}. Use your instance's base URL (e.g. https://n8n.example.com), not a link to a specific workflow.`,
          },
          { status: 400 },
        )
      }
      return NextResponse.json(
        { success: false, code: 'DEPLOY_FAILED', message: `n8n returned ${res.status}`, details: txt.slice(0, 300) },
        { status: 502 },
      )
    }
    created = await res.json().catch(() => ({}))
  } catch (err) {
    return NextResponse.json(
      { success: false, code: 'INSTANCE_UNREACHABLE', message: 'Could not reach the n8n instance' },
      { status: 502 },
    )
  }

  const n8nId = created?.id ?? created?.data?.id
  // 2) activate it (best-effort — deploy still counts as success if activate is unsupported)
  let active = false
  if (n8nId) {
    try {
      const act = await fetch(`${url}/api/v1/workflows/${n8nId}/activate`, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(15_000),
      })
      active = act.ok
    } catch {
      /* leave inactive; deploy succeeded */
    }
  }

  // The workflows page already opens `n8n_url` in a new tab, but this route
  // never sent one — so a deploy gave no way to go look at the result. That is
  // the whole point of the superadmin test path, so return it in both modes.
  const n8nUrl = n8nId ? `${publicBase}/workflow/${n8nId}` : undefined

  return NextResponse.json({
    success: true,
    n8n_workflow_id: n8nId,
    active,
    workflow_id: body?.workflow_id,
    n8n_url: n8nUrl,
    instance: useAivoryInstance ? 'aivory' : 'byo',
  })
}
