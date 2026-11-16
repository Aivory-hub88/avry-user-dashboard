/** Storage for the draft-replies setting and the latest AI draft per contact. SERVER-ONLY (Node runtime). */
import { query } from '@/lib/db'

export type ReplyMode = 'approval' | 'autonomous'
export type DraftConfig = { draftReplies: boolean; agent: string | null; replyMode: ReplyMode }

export async function getDraftConfig(userId: string): Promise<DraftConfig> {
  const r = await query('SELECT draft_replies, draft_agent, reply_mode FROM dashboard.whatsapp_settings WHERE user_id = $1', [userId])
  const row = r.rows[0] as { draft_replies: boolean; draft_agent: string | null; reply_mode: string } | undefined
  return { draftReplies: row?.draft_replies === true, agent: row?.draft_agent ?? null, replyMode: row?.reply_mode === 'autonomous' ? 'autonomous' : 'approval' }
}

/** Updates only the fields given; `agent: null` clears the choice. */
export async function setDraftConfig(userId: string, change: { draftReplies?: boolean; agent?: string | null; replyMode?: ReplyMode }): Promise<void> {
  const cur = await getDraftConfig(userId)
  const next = { draftReplies: change.draftReplies ?? cur.draftReplies, agent: change.agent === undefined ? cur.agent : change.agent, replyMode: change.replyMode ?? cur.replyMode }
  await query(
    `INSERT INTO dashboard.whatsapp_settings (user_id, draft_replies, draft_agent, reply_mode) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET draft_replies = EXCLUDED.draft_replies, draft_agent = EXCLUDED.draft_agent, reply_mode = EXCLUDED.reply_mode, updated_at = now()`,
    [userId, next.draftReplies, next.agent, next.replyMode],
  )
}

export type Draft = { text: string; createdAt: string; writer: string | null; note: string | null }

export async function getDraft(userId: string, contactId: string): Promise<Draft | null> {
  const r = await query('SELECT body, created_at, writer, note FROM dashboard.whatsapp_drafts WHERE user_id = $1 AND contact_id = $2', [userId, contactId])
  const row = r.rows[0] as { body: string; created_at: Date; writer: string | null; note: string | null } | undefined
  return row ? { text: row.body, createdAt: new Date(row.created_at).toISOString(), writer: row.writer, note: row.note } : null
}

/** `note` says why a reply was held back from automatic sending, when that is why this draft exists. */
export async function saveDraft(userId: string, contactId: string, text: string, sourceMessageId: string | null, writer: string | null = null, note: string | null = null): Promise<void> {
  await query(
    `INSERT INTO dashboard.whatsapp_drafts (user_id, contact_id, body, source_message_id, writer, note) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, contact_id) DO UPDATE SET body = EXCLUDED.body, source_message_id = EXCLUDED.source_message_id, writer = EXCLUDED.writer, note = EXCLUDED.note, created_at = now()`,
    [userId, contactId, text, sourceMessageId, writer, note],
  )
}

export async function deleteDraft(userId: string, contactId: string): Promise<void> {
  await query('DELETE FROM dashboard.whatsapp_drafts WHERE user_id = $1 AND contact_id = $2', [userId, contactId])
}

/** Automatic replies sent in the last hour, for rate limits. */
export async function countAutoReplies(userId: string, contactId: string): Promise<{ contactCount: number; accountCount: number }> {
  const r = await query(
    `SELECT count(*) FILTER (WHERE contact_id = $2)::int AS c, count(*)::int AS a
       FROM dashboard.whatsapp_auto_replies WHERE user_id = $1 AND sent_at > now() - interval '1 hour'`,
    [userId, contactId],
  )
  const row = r.rows[0] as { c: number; a: number } | undefined
  return { contactCount: row?.c ?? 0, accountCount: row?.a ?? 0 }
}

export async function recordAutoReply(userId: string, contactId: string): Promise<void> {
  await query('INSERT INTO dashboard.whatsapp_auto_replies (user_id, contact_id) VALUES ($1, $2)', [userId, contactId])
}
