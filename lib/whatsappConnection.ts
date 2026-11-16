/**
 * Which Kapso number a CRM account uses. SERVER-ONLY (Node runtime).
 *
 *   own     a customer's own Kapso key, stored encrypted in
 *           dashboard.whatsapp_connections (migrations/dashboard-whatsapp-connections.sql)
 *   aivory  the number Aivory owns, from env (KAPSO_API_KEY, KAPSO_PHONE_NUMBER_ID,
 *           KAPSO_WEBHOOK_SECRET), available only to the account KAPSO_CRM_TENANT_ID
 *
 * An account's own connection wins over the Aivory number. Keys never leave the server.
 */
import { randomBytes } from 'crypto'
import { query } from '@/lib/db'
import { decryptSecret, encryptSecret } from '@/lib/crypto'

export type WaConnection = { mode: 'own' | 'aivory'; apiKey: string; phoneNumberId: string; webhookSecret: string; displayPhone: string | null }

export function aivoryTenant(): string | null {
  return process.env.KAPSO_CRM_TENANT_ID?.trim() || null
}

export function aivoryConnection(): WaConnection | null {
  const apiKey = process.env.KAPSO_API_KEY?.trim()
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID?.trim()
  const webhookSecret = process.env.KAPSO_WEBHOOK_SECRET?.trim()
  if (!apiKey || !phoneNumberId || !webhookSecret || !aivoryTenant()) return null
  return { mode: 'aivory', apiKey, phoneNumberId, webhookSecret, displayPhone: process.env.KAPSO_DISPLAY_PHONE?.trim() || null }
}

type Row = { user_id: string; phone_number_id: string; display_phone: string | null; api_key_enc: Buffer; webhook_secret_enc: Buffer }
const fromRow = (r: Row): WaConnection => ({
  mode: 'own',
  apiKey: decryptSecret(r.api_key_enc),
  phoneNumberId: r.phone_number_id,
  webhookSecret: decryptSecret(r.webhook_secret_enc),
  displayPhone: r.display_phone,
})

export async function getConnection(userId: string): Promise<WaConnection | null> {
  const res = await query('SELECT * FROM dashboard.whatsapp_connections WHERE user_id = $1', [userId])
  if (res.rows[0]) return fromRow(res.rows[0] as Row)
  return userId === aivoryTenant() ? aivoryConnection() : null
}

export async function getConnectionByToken(token: string): Promise<{ userId: string; conn: WaConnection } | null> {
  const res = await query('SELECT * FROM dashboard.whatsapp_connections WHERE webhook_token = $1', [token])
  const r = res.rows[0] as Row | undefined
  return r ? { userId: r.user_id, conn: fromRow(r) } : null
}

export function newWebhookCredentials(): { token: string; secret: string } {
  return { token: randomBytes(18).toString('hex'), secret: randomBytes(24).toString('hex') }
}

export async function saveConnection(userId: string, c: { apiKey: string; phoneNumberId: string; displayPhone: string | null; token: string; secret: string }): Promise<void> {
  await query(
    `INSERT INTO dashboard.whatsapp_connections (user_id, phone_number_id, display_phone, api_key_enc, webhook_secret_enc, webhook_token)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET phone_number_id = EXCLUDED.phone_number_id, display_phone = EXCLUDED.display_phone,
       api_key_enc = EXCLUDED.api_key_enc, webhook_secret_enc = EXCLUDED.webhook_secret_enc, webhook_token = EXCLUDED.webhook_token`,
    [userId, c.phoneNumberId, c.displayPhone, encryptSecret(c.apiKey), encryptSecret(c.secret), c.token],
  )
}

export async function deleteConnection(userId: string): Promise<boolean> {
  const res = await query('DELETE FROM dashboard.whatsapp_connections WHERE user_id = $1', [userId])
  return (res.rowCount ?? 0) > 0
}
