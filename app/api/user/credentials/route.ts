/**
 * n8n instance credentials for the signed-in user (dashboard.n8n_credentials,
 * migrations/dashboard-n8n-credentials.sql).
 *
 * GET   → { instanceUrl, hasApiKey, updatedAt } | null — the decrypted API
 *         key is NEVER returned to the browser.
 * PATCH → upsert { n8n_instance_url, n8n_api_key } for the signed-in user.
 *         This is the endpoint lib/workflows/credentialStore.ts's
 *         saveToDatabaseStub() has been calling all along (it 404'd until
 *         this route existed) — request body shape kept as-is.
 *
 * Auth is mandatory: user_id comes ONLY from the verified JWT
 * (lib/serverAuth.ts) — same pattern as app/api/storage/[entity]/route.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, type AuthUser } from '@/lib/serverAuth'
import { getUserN8nCredentialStatus, saveUserN8nCredentials } from '@/lib/workflows/n8nCredentialsServer'
import { isValidN8nUrl } from '@/lib/workflows/credentialStore'

export const runtime = 'nodejs'

function authenticate(request: NextRequest): { user: AuthUser } | { response: NextResponse } {
  let user: AuthUser | null
  try {
    user = getAuthUser(request)
  } catch (err) {
    console.error('[api/user/credentials] auth misconfiguration:', err)
    return { response: NextResponse.json({ error: 'Credential storage unavailable' }, { status: 500 }) }
  }
  if (!user) {
    return { response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  }
  return { user }
}

export async function GET(request: NextRequest) {
  const auth = authenticate(request)
  if ('response' in auth) return auth.response

  try {
    const status = await getUserN8nCredentialStatus(auth.user.user_id)
    return NextResponse.json(status)
  } catch (err) {
    console.error('[api/user/credentials] GET failed:', err)
    return NextResponse.json({ error: 'Credential storage unavailable' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = authenticate(request)
  if ('response' in auth) return auth.response

  let body: { n8n_instance_url?: unknown; n8n_api_key?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const instanceUrl = typeof body.n8n_instance_url === 'string' ? body.n8n_instance_url.trim() : ''
  const apiKey = typeof body.n8n_api_key === 'string' ? body.n8n_api_key.trim() : ''
  if (!isValidN8nUrl(instanceUrl) || !apiKey) {
    return NextResponse.json({ error: 'A valid n8n_instance_url and non-empty n8n_api_key are required' }, { status: 400 })
  }

  try {
    await saveUserN8nCredentials(auth.user.user_id, instanceUrl, apiKey)
  } catch (err) {
    console.error('[api/user/credentials] PATCH failed:', err)
    return NextResponse.json({ error: 'Credential storage unavailable' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
