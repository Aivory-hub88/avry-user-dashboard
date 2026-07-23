/**
 * GET /api/n8n/workflow/[id]/executions
 * Backs the canvas's "Execution Logs" tab (components/workflow/WorkflowCanvas.tsx,
 * loadExecutions) — this route did not exist at all until now, so that tab
 * always 404'd.
 *
 * `id` is whatever WorkflowCanvas passes as `n8nWorkflowId || workflowId` —
 * before a workflow is deployed that's Aivory's own internal id, which n8n
 * simply has no executions for (empty list, not an error).
 *
 * Aivory's bring-your-own-n8n model is one instance per user, so unlike
 * app/api/workflows/activate/route.ts (which receives creds directly in the
 * POST body), this route resolves the signed-in user's saved instance URL +
 * API key server-side via dashboard.n8n_credentials
 * (lib/workflows/n8nCredentialsServer.ts) rather than requiring the client to
 * attach them on every request.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, type AuthUser } from '@/lib/serverAuth'
import { getUserN8nCredentials } from '@/lib/workflows/n8nCredentialsServer'
import { getExecutionsWithCreds, classifyN8nError } from '@/lib/workflows/n8nClient'

export const runtime = 'nodejs'

function authenticate(request: NextRequest): { user: AuthUser } | { response: NextResponse } {
  let user: AuthUser | null
  try {
    user = getAuthUser(request)
  } catch (err) {
    console.error('[api/n8n/workflow/executions] auth misconfiguration:', err)
    return { response: NextResponse.json({ error: 'Executions unavailable' }, { status: 500 }) }
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

  const limitParam = request.nextUrl.searchParams.get('limit')
  const limit = Math.min(100, Math.max(1, parseInt(limitParam ?? '20', 10) || 20))

  let creds
  try {
    creds = await getUserN8nCredentials(auth.user.user_id)
  } catch (err) {
    console.error('[api/n8n/workflow/executions] credential lookup failed:', err)
    return NextResponse.json({ error: 'Executions unavailable' }, { status: 500 })
  }
  if (!creds) {
    return NextResponse.json(
      { error: 'No n8n instance connected yet', code: 'NO_CREDENTIALS', data: [] },
      { status: 400 }
    )
  }

  try {
    const executions = await getExecutionsWithCreds(
      { instanceUrl: creds.instanceUrl, apiKey: creds.apiKey },
      id,
      limit
    )
    return NextResponse.json({ data: executions })
  } catch (err) {
    const classified = classifyN8nError(err, creds.instanceUrl)
    return NextResponse.json({ error: classified.message, code: classified.code }, { status: classified.status })
  }
}
