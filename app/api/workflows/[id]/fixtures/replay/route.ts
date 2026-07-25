import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, type AuthUser } from '@/lib/serverAuth'
import { getUserN8nCredentials } from '@/lib/workflows/n8nCredentialsServer'
import { getWorkflowWithCreds, setWorkflowPinDataWithCreds, getN8nWebhookUrl, classifyN8nError } from '@/lib/workflows/n8nClient'
import { listFixtures } from '@/lib/workflows/fixtureRepository'
import { buildPinDataFromFixtureRunData } from '@/lib/workflows/fixtureDiff'

// POST /api/workflows/:id/fixtures/replay — true offline replay for an
// already-deployed workflow (the frontend/n8nClient.ts twin of Stage 15/C4,
// which is bridge-only and only covers copilot-generated drafts under
// sandbox test). Pins the newest captured fixture's data onto the real,
// deployed n8n workflow ({ n8nWorkflowId, executionId? }).
//
// IMPORTANT: this only PINS the data — there is no API-key-authenticated way
// to also trigger a run on the user's own n8n instance (confirmed against a
// live instance: the run endpoint 405s under API-key auth, only n8n's
// internal session-cookie-only endpoints support it). The caller must
// trigger the workflow themselves (its real webhook/schedule, or manually
// inside n8n's editor) and should call the sibling .../replay/clear route
// afterward so the pin doesn't silently affect real production traffic.

export const runtime = 'nodejs'

function authenticate(request: NextRequest): { user: AuthUser } | { response: NextResponse } {
  let user: AuthUser | null
  try {
    user = getAuthUser(request)
  } catch (err) {
    console.error('[api/workflows/fixtures/replay] auth misconfiguration:', err)
    return { response: NextResponse.json({ error: 'Replay unavailable' }, { status: 500 }) }
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

  let body: { n8nWorkflowId?: string; executionId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.n8nWorkflowId) {
    return NextResponse.json({ error: 'n8nWorkflowId is required' }, { status: 400 })
  }

  let fixtures
  try {
    fixtures = await listFixtures(id)
  } catch (err) {
    console.error(`[POST /api/workflows/${id}/fixtures/replay] fixture lookup failed:`, err)
    return NextResponse.json({ error: 'Replay unavailable' }, { status: 500 })
  }
  const fixture = body.executionId
    ? fixtures.find((f) => f.executionId === body.executionId)
    : fixtures[0]
  if (!fixture) {
    return NextResponse.json({ error: 'No fixture captured for this workflow yet', code: 'NO_FIXTURE' }, { status: 400 })
  }

  let creds
  try {
    creds = await getUserN8nCredentials(auth.user.user_id)
  } catch (err) {
    console.error('[api/workflows/fixtures/replay] credential lookup failed:', err)
    return NextResponse.json({ error: 'Replay unavailable' }, { status: 500 })
  }
  if (!creds) {
    return NextResponse.json({ error: 'No n8n instance connected yet', code: 'NO_CREDENTIALS' }, { status: 400 })
  }

  const conn = { instanceUrl: creds.instanceUrl, apiKey: creds.apiKey }
  try {
    const pinData = buildPinDataFromFixtureRunData(fixture.runData)
    const pinnedNodes = Object.keys(pinData)
    if (pinnedNodes.length === 0) {
      return NextResponse.json({ error: 'Fixture has no capturable node data to pin', code: 'EMPTY_FIXTURE' }, { status: 400 })
    }

    await setWorkflowPinDataWithCreds(conn, body.n8nWorkflowId, pinData)

    // Convenience only — surface a webhook trigger URL when present so the
    // UI can show something clickable for "now go trigger it."
    const workflow = await getWorkflowWithCreds(conn, body.n8nWorkflowId)
    const webhookNode = (workflow.nodes ?? []).find((n) => (n.type || '').toLowerCase().includes('webhook'))
    const webhookPath = webhookNode?.parameters?.path
    const webhookUrl = typeof webhookPath === 'string' && webhookPath ? getN8nWebhookUrl(`/webhook/${webhookPath}`) : null

    return NextResponse.json({ fixtureName: fixture.name, pinnedNodes, webhookUrl })
  } catch (err) {
    const classified = classifyN8nError(err, creds.instanceUrl)
    return NextResponse.json({ error: classified.message, code: classified.code }, { status: classified.status })
  }
}
