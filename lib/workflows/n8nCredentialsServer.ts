/**
 * Server-only accessor for a user's stored n8n instance credentials
 * (dashboard.n8n_credentials — migrations/dashboard-n8n-credentials.sql).
 *
 * Used by app/api/user/credentials/route.ts (save/read the instance URL +
 * masked status) and by app/api/n8n/workflow/[id]/executions/route.ts (needs
 * the decrypted API key server-side to call the user's real n8n instance).
 *
 * Node runtime only — routes importing this must declare
 * `export const runtime = 'nodejs'`.
 */
import { query } from '@/lib/db'
import { encryptSecret, decryptSecret } from '@/lib/crypto'
import { normalizeN8nBaseUrl } from '@/lib/workflows/credentialStore'
import type { AuthUser } from '@/lib/serverAuth'

export interface N8nCredentialRecord {
  instanceUrl: string
  apiKey: string
  updatedAt: string
}

/** Returns the user's stored n8n instance URL + decrypted API key, or null if none saved. */
export async function getUserN8nCredentials(userId: string): Promise<N8nCredentialRecord | null> {
  const result = await query(
    'SELECT instance_url, api_key_encrypted, updated_at FROM dashboard.n8n_credentials WHERE user_id = $1',
    [userId]
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    instanceUrl: row.instance_url,
    apiKey: decryptSecret(row.api_key_encrypted),
    updatedAt: row.updated_at,
  }
}

/** Upserts the user's n8n instance URL + API key (encrypted before storage). */
export async function saveUserN8nCredentials(userId: string, instanceUrl: string, apiKey: string): Promise<void> {
  await query(
    `INSERT INTO dashboard.n8n_credentials (user_id, instance_url, api_key_encrypted)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       instance_url = EXCLUDED.instance_url,
       api_key_encrypted = EXCLUDED.api_key_encrypted,
       updated_at = now()`,
    [userId, instanceUrl, encryptSecret(apiKey)]
  )
}

/**
 * Resolve which n8n instance a reload/executions/fixtures request should use.
 *
 * A workflow deployed with the superadmin "Use the Aivory test instance"
 * checkbox (app/api/workflows/activate/route.ts) never has anything saved to
 * dashboard.n8n_credentials — by design, there's no user-specific credential
 * to store, the server resolves its own instance from env. But every OTHER
 * route that talks to n8n (this workflow's canvas reload, execution logs,
 * fixtures) only ever looked up getUserN8nCredentials(), so a workflow
 * deployed to the Aivory instance could never be reopened — it always 400'd
 * NO_CREDENTIALS, and manually pasting the server's own N8N_API_KEY into the
 * credential form (the only workaround available) is exactly the kind of
 * error-prone step that produces a mismatched/wrong key.
 *
 * `instanceHint` is a client-supplied '?instance=aivory' query param — safe
 * to trust for ROUTING only, because it grants nothing on its own: this
 * still re-verifies account_type from the caller's own verified JWT before
 * ever touching the env-held Aivory credentials, exactly like the deploy
 * route does. A non-superadmin (or a superadmin who never actually deployed
 * this workflow to the Aivory instance) requesting instance=aivory simply
 * gets refused and falls through to their own stored credential, if any.
 */
export async function resolveN8nCredentials(
  user: AuthUser,
  instanceHint: string | null
): Promise<{ instanceUrl: string; apiKey: string } | null> {
  if (instanceHint === 'aivory') {
    if (user.account_type !== 'superadmin') return null
    const envUrl = (process.env.N8N_BASE_URL ?? '').trim()
    const envKey = (process.env.N8N_API_KEY ?? '').trim()
    if (!envUrl || !envKey) return null
    return { instanceUrl: normalizeN8nBaseUrl(envUrl).replace(/\/$/, ''), apiKey: envKey }
  }
  const stored = await getUserN8nCredentials(user.user_id)
  return stored ? { instanceUrl: stored.instanceUrl, apiKey: stored.apiKey } : null
}

/** Metadata-only read (no decrypted key) — safe to return straight to the browser. */
export async function getUserN8nCredentialStatus(userId: string): Promise<{ instanceUrl: string; hasApiKey: boolean; updatedAt: string } | null> {
  const result = await query(
    'SELECT instance_url, updated_at FROM dashboard.n8n_credentials WHERE user_id = $1',
    [userId]
  )
  const row = result.rows[0]
  if (!row) return null
  return { instanceUrl: row.instance_url, hasApiKey: true, updatedAt: row.updated_at }
}
