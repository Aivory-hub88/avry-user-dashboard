/**
 * Writes an AI draft for the latest inbound message of a contact, when the account has turned drafts on.
 * Dependencies are injected so the decision logic is testable. A draft is only stored; nothing is sent.
 */
import type { LoggedEntry } from './whatsappInbound'
import { buildDraftPrompt, cleanDraft, historyFromNotes, shouldDraftFor, type ChatTurn } from './whatsappDraftPrompt'

export type DraftDeps = {
  enabled(tenantId: string): Promise<boolean>
  notes(contactId: string): Promise<{ kind: string; body: string | null; occurred_at: string }[]>
  ask(message: string, history: ChatTurn[]): Promise<string | null>
  save(tenantId: string, contactId: string, text: string, sourceMessageId: string | null): Promise<void>
}

export type DraftOutcome = 'drafted' | 'skipped' | 'off' | 'empty'

export async function draftForEntry(tenantId: string, e: LoggedEntry, d: DraftDeps): Promise<DraftOutcome> {
  if (!shouldDraftFor(e.message.text)) return 'skipped'
  if (!(await d.enabled(tenantId))) return 'off'
  // The message we are answering is already logged; send it as the question, not as history.
  const history = historyFromNotes(await d.notes(e.contactId))
  const last = history.at(-1)
  const prior = last && last.role === 'user' && last.content === e.message.text.split('\nTemplate: ')[0] ? history.slice(0, -1) : history
  const reply = cleanDraft(await d.ask(buildDraftPrompt(e.contactName, e.message.text), prior))
  if (!reply) return 'empty'
  await d.save(tenantId, e.contactId, reply, e.message.id)
  return 'drafted'
}

/** One entry per contact (their latest message), so a burst of messages gets one draft. */
export function latestPerContact(entries: LoggedEntry[]): LoggedEntry[] {
  const m = new Map<string, LoggedEntry>()
  for (const e of entries) m.set(e.contactId, e)
  return [...m.values()]
}
