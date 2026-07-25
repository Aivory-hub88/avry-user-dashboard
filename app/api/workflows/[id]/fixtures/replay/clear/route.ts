import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, type AuthUser } from '@/lib/serverAuth'
import { getUserN8nCredentials } from '@/lib/workflows/n8nCredentialsServer'
import { clearWorkflowPinDataWithCreds, classifyN8nError } from '@/lib/workflows/n8nClient'

// POST /api/workflows/:id/fixtures/replay/clear — reverts the sibling
// .../replay route's pin, setting pinData back to {} on the deployed n8n
// workflow ({ n8nWorkflowId }).

export const runtime = 'nodejs'

function authenticate(request: NextRequest): { user: AuthUser } | { response: NextResponse } {
  let user: AuthUser | null
  try {
    user = getAuthUser(request)
  } catch (err) {
    console.error('[api/workflows/fixtures/replay/clear] auth misconfiguration:', err)
    return { response: NextResponse.json({ error: 'Clear-pin unavailable' }, { status: 500 }) }
  }
  if (!user) {
    return { response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  }
  return { user }
}

export async function POST(
  request: NextRequest,
  _ctx: { params: Promise<{ id: string }> }
) {
  const auth = authenticate(request)
  if ('response' in auth) return auth.response

  let body: { n8nWorkflowId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.n8nWorkflowId) {
    return NextResponse.json({ error: 'n8nWorkflowId is required' }, { status: 400 })
  }

  let creds
  try {
    creds = await getUserN8nCredentials(auth.user.user_id)
  } catch (err) {
    console.error('[api/workflows/fixtures/replay/clear] credential lookup failed:', err)
    return NextResponse.json({ error: 'Clear-pin unavailable' }, { status: 500 })
  }
  if (!creds) {
    return NextResponse.json({ error: 'No n8n instance connected yet', code: 'NO_CREDENTIALS' }, { status: 400 })
  }

  try {
    await clearWorkflowPinDataWithCreds({ instanceUrl: creds.instanceUrl, apiKey: creds.apiKey }, body.n8nWorkflowId)
    return NextResponse.json({ cleared: true })
  } catch (err) {
    const classified = classifyN8nError(err, creds.instanceUrl)
    return NextResponse.json({ error: classified.message, code: classified.code }, { status: classified.status })
  }
}
