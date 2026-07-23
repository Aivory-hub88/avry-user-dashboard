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
