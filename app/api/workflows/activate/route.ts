import { NextRequest, NextResponse } from 'next/server'

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

  const url = (body?.n8n_instance_url ?? '').toString().trim().replace(/\/$/, '')
  const apiKey = (body?.n8n_api_key ?? '').toString().trim()
  if (!url || !apiKey) {
    return NextResponse.json(
      { success: false, code: 'MISSING_CREDS', message: 'n8n URL and API key are required' },
      { status: 400 },
    )
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

  return NextResponse.json({ success: true, n8n_workflow_id: n8nId, active, workflow_id: body?.workflow_id })
}
