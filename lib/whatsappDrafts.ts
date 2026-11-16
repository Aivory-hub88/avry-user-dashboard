/** Storage for the draft-replies setting and the latest AI draft per contact. SERVER-ONLY (Node runtime). */
import { query } from '@/lib/db'

export type DraftConfig = { draftReplies: boolean; agent: string | null }

export async function getDraftConfig(userId: string): Promise<DraftConfig> {
  const r = await query('SELECT draft_replies, draft_agent FROM dashboard.whatsapp_settings WHERE user_id = $1', [userId])
  const row = r.rows[0] as { draft_replies: boolean; draft_agent: string | null } | undefined
  return { draftReplies: row?.draft_replies === true, agent: row?.draft_agent ?? null }
}

/** Updates only the fields given; `agent: null` clears the choice. */
export async function setDraftConfig(userId: string, change: { draftReplies?: boolean; agent?: string | null }): Promise<void> {
  const cur = await getDraftConfig(userId)
  const next = { draftReplies: change.draftReplies ?? cur.draftReplies, agent: change.agent === undefined ? cur.agent : change.agent }
  await query(
    `INSERT INTO dashboard.whatsapp_settings (user_id, draft_replies, draft_agent) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET draft_replies = EXCLUDED.draft_replies, draft_agent = EXCLUDED.draft_agent, updated_at = now()`,
    [userId, next.draftReplies, next.agent],
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
