/**
 * GET  /api/n8n/workflow/[id] — fetch a workflow's live n8n JSON.
 * PUT  /api/n8n/workflow/[id] — overwrite a workflow's n8n JSON.
 *
 * Backs components/workflow/WorkflowCanvas.tsx's ACTIVE-workflow path: once a
 * workflow is deployed/active, the canvas loads and saves directly against
 * n8n (rather than Aivory's own canvasRepository) via exactly these two
 * calls. Neither existed until now, so opening or saving an active
 * workflow's canvas always failed.
 *
 * Same auth + credential-resolution pattern as the sibling
 * app/api/n8n/workflow/[id]/executions/route.ts — see that file for why
 * credentials are resolved server-side instead of sent by the client.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, type AuthUser } from '@/lib/serverAuth'
import { getUserN8nCredentials } from '@/lib/workflows/n8nCredentialsServer'
import { getWorkflowWithCreds, updateWorkflowWithCreds, classifyN8nError } from '@/lib/workflows/n8nClient'

export const runtime = 'nodejs'

function authenticate(request: NextRequest): { user: AuthUser } | { response: NextResponse } {
  let user: AuthUser | null
  try {
    user = getAuthUser(request)
  } catch (err) {
    console.error('[api/n8n/workflow] auth misconfiguration:', err)
    return { response: NextResponse.json({ error: 'Workflow sync unavailable' }, { status: 500 }) }
  }
  if (!user) {
    return { response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  }
  return { user }
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  const auth = authenticate(request)
  if ('response' in auth) return auth.response

  let creds
  try {
    creds = await getUserN8nCredentials(auth.user.user_id)
  } catch (err) {
    console.error('[api/n8n/workflow] credential lookup failed:', err)
    return NextResponse.json({ error: 'Workflow sync unavailable' }, { status: 500 })
  }
  if (!creds) {
    return NextResponse.json({ error: 'No n8n instance connected yet', code: 'NO_CREDENTIALS' }, { status: 400 })
  }

  try {
    const workflow = await getWorkflowWithCreds({ instanceUrl: creds.instanceUrl, apiKey: creds.apiKey }, id)
    return NextResponse.json(workflow)
  } catch (err) {
    const classified = classifyN8nError(err, creds.instanceUrl)
    return NextResponse.json({ error: classified.message, code: classified.code }, { status: classified.status })
  }
}

export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  const auth = authenticate(request)
  if ('response' in auth) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  let creds
  try {
    creds = await getUserN8nCredentials(auth.user.user_id)
  } catch (err) {
    console.error('[api/n8n/workflow] credential lookup failed:', err)
    return NextResponse.json({ error: 'Workflow sync unavailable' }, { status: 500 })
  }
  if (!creds) {
    return NextResponse.json({ error: 'No n8n instance connected yet', code: 'NO_CREDENTIALS' }, { status: 400 })
  }

  try {
    const updated = await updateWorkflowWithCreds({ instanceUrl: creds.instanceUrl, apiKey: creds.apiKey }, id, body)
    return NextResponse.json(updated)
  } catch (err) {
    const classified = classifyN8nError(err, creds.instanceUrl)
    return NextResponse.json({ error: classified.message, code: classified.code }, { status: classified.status })
  }
}
