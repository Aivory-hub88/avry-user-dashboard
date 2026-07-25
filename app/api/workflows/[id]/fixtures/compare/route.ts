import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, type AuthUser } from '@/lib/serverAuth'
import { getUserN8nCredentials } from '@/lib/workflows/n8nCredentialsServer'
import { getExecutionDetailWithCreds, classifyN8nError } from '@/lib/workflows/n8nClient'
import { listFixtures } from '@/lib/workflows/fixtureRepository'
import { diffRunData } from '@/lib/workflows/fixtureDiff'

// POST /api/workflows/:id/fixtures/compare — live re-run comparison, NOT true
// offline replay (that's Stage C4, a separate VPS-side capability). Diffs the
// newest captured fixture for this workflow against a freshly-fetched n8n
// execution's run data ({ executionId }). Same trust boundary as the sibling
// fixtures/route.ts — reads from the user's own n8n instance via their
// stored credentials.

export const runtime = 'nodejs'

function authenticate(request: NextRequest): { user: AuthUser } | { response: NextResponse } {
  let user: AuthUser | null
  try {
    user = getAuthUser(request)
  } catch (err) {
    console.error('[api/workflows/fixtures/compare] auth misconfiguration:', err)
    return { response: NextResponse.json({ error: 'Comparison unavailable' }, { status: 500 }) }
  }
  if (!user) {
    return { response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  }
  return { user }
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  const auth = authenticate(request)
  if ('response' in auth) return auth.response

  let body: { executionId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.executionId) {
    return NextResponse.json({ error: 'executionId is required' }, { status: 400 })
  }

  let fixtures
  try {
    fixtures = await listFixtures(id)
  } catch (err) {
    console.error(`[POST /api/workflows/${id}/fixtures/compare] fixture lookup failed:`, err)
    return NextResponse.json({ error: 'Comparison unavailable' }, { status: 500 })
  }
  const fixture = fixtures[0]
  if (!fixture) {
    return NextResponse.json({ error: 'No fixture captured for this workflow yet', code: 'NO_FIXTURE' }, { status: 400 })
  }

  let creds
  try {
    creds = await getUserN8nCredentials(auth.user.user_id)
  } catch (err) {
    console.error('[api/workflows/fixtures/compare] credential lookup failed:', err)
    return NextResponse.json({ error: 'Comparison unavailable' }, { status: 500 })
  }
  if (!creds) {
    return NextResponse.json({ error: 'No n8n instance connected yet', code: 'NO_CREDENTIALS' }, { status: 400 })
  }

  try {
    const freshExecution = await getExecutionDetailWithCreds(
      { instanceUrl: creds.instanceUrl, apiKey: creds.apiKey },
      body.executionId
    )
    const entries = diffRunData(fixture.runData, freshExecution.data ?? freshExecution)
    return NextResponse.json({ fixtureId: fixture.id, fixtureName: fixture.name, entries })
  } catch (err) {
    const classified = classifyN8nError(err, creds.instanceUrl)
    return NextResponse.json({ error: classified.message, code: classified.code }, { status: classified.status })
  }
}
