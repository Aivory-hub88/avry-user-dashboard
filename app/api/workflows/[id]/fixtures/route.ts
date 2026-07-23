import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, type AuthUser } from '@/lib/serverAuth'
import { getUserN8nCredentials } from '@/lib/workflows/n8nCredentialsServer'
import { getExecutionDetailWithCreds, classifyN8nError } from '@/lib/workflows/n8nClient'
import { captureFixture, listFixtures } from '@/lib/workflows/fixtureRepository'

// GET  /api/workflows/:id/fixtures — list captured fixtures for a workflow.
// POST /api/workflows/:id/fixtures — capture a new fixture from a real n8n
// execution id ({ executionId, name }). Requires real auth, unlike the rest
// of this app's draft-workflow storage — capturing reads from the user's
// own n8n instance via their stored credentials (same trust boundary as
// app/api/n8n/workflow/[id]/executions/route.ts).

export const runtime = 'nodejs'

function authenticate(request: NextRequest): { user: AuthUser } | { response: NextResponse } {
  let user: AuthUser | null
  try {
    user = getAuthUser(request)
  } catch (err) {
    console.error('[api/workflows/fixtures] auth misconfiguration:', err)
    return { response: NextResponse.json({ error: 'Fixtures unavailable' }, { status: 500 }) }
  }
  if (!user) {
    return { response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  }
  return { user }
}

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  const auth = authenticate(_request)
  if ('response' in auth) return auth.response

  try {
    const fixtures = await listFixtures(id)
    return NextResponse.json(fixtures)
  } catch (err) {
    console.error(`[GET /api/workflows/${id}/fixtures]`, err)
    return NextResponse.json({ error: 'Fixtures unavailable' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  const auth = authenticate(request)
  if ('response' in auth) return auth.response

  let body: { executionId?: string; name?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.executionId || !body.name) {
    return NextResponse.json({ error: 'executionId and name are required' }, { status: 400 })
  }

  let creds
  try {
    creds = await getUserN8nCredentials(auth.user.user_id)
  } catch (err) {
    console.error('[api/workflows/fixtures] credential lookup failed:', err)
    return NextResponse.json({ error: 'Fixtures unavailable' }, { status: 500 })
  }
  if (!creds) {
    return NextResponse.json({ error: 'No n8n instance connected yet', code: 'NO_CREDENTIALS' }, { status: 400 })
  }

  try {
    const execution = await getExecutionDetailWithCreds(
      { instanceUrl: creds.instanceUrl, apiKey: creds.apiKey },
      body.executionId
    )
    const fixture = await captureFixture(auth.user.user_id, id, body.executionId, body.name, execution.data ?? execution)
    return NextResponse.json(fixture, { status: 201 })
  } catch (err) {
    const classified = classifyN8nError(err, creds.instanceUrl)
    return NextResponse.json({ error: classified.message, code: classified.code }, { status: classified.status })
  }
}
