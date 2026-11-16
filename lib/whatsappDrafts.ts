/** Storage for the draft-replies setting and the latest AI draft per contact. SERVER-ONLY (Node runtime). */
import { query } from '@/lib/db'

export async function getDraftSetting(userId: string): Promise<boolean> {
  const r = await query('SELECT draft_replies FROM dashboard.whatsapp_settings WHERE user_id = $1', [userId])
  return r.rows[0]?.draft_replies === true
}

export async function setDraftSetting(userId: string, on: boolean): Promise<void> {
  await query(
    `INSERT INTO dashboard.whatsapp_settings (user_id, draft_replies) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET draft_replies = EXCLUDED.draft_replies, updated_at = now()`,
    [userId, on],
  )
}

export type Draft = { text: string; createdAt: string }

export async function getDraft(userId: string, contactId: string): Promise<Draft | null> {
  const r = await query('SELECT body, created_at FROM dashboard.whatsapp_drafts WHERE user_id = $1 AND contact_id = $2', [userId, contactId])
  const row = r.rows[0] as { body: string; created_at: Date } | undefined
  return row ? { text: row.body, createdAt: new Date(row.created_at).toISOString() } : null
}

export async function saveDraft(userId: string, contactId: string, text: string, sourceMessageId: string | null): Promise<void> {
  await query(
    `INSERT INTO dashboard.whatsapp_drafts (user_id, contact_id, body, source_message_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, contact_id) DO UPDATE SET body = EXCLUDED.body, source_message_id = EXCLUDED.source_message_id, created_at = now()`,
    [userId, contactId, text, sourceMessageId],
  )
}

export async function deleteDraft(userId: string, contactId: string): Promise<void> {
  await query('DELETE FROM dashboard.whatsapp_drafts WHERE user_id = $1 AND contact_id = $2', [userId, contactId])
}
