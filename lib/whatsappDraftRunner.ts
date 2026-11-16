/**
 * Writes an AI draft for the latest inbound message of a contact, when the account has turned drafts on.
 * Dependencies are injected so the decision logic is testable. A draft is only stored; nothing is sent.
 */
import type { LoggedEntry } from './whatsappInbound'
import { buildAgentDraftPrompt, buildDraftPrompt, cleanDraft, historyFromNotes, shouldDraftFor, type ChatTurn } from './whatsappDraftPrompt'

/** Who writes the draft: nobody, Aivory's own assistant (Aivory's number only), or the customer's agent. */
export type DraftMode = { kind: 'off' } | { kind: 'assistant' } | { kind: 'agent'; agent: string }

export type DraftDeps = {
  mode(tenantId: string): Promise<DraftMode>
  notes(contactId: string): Promise<{ kind: string; body: string | null; occurred_at: string }[]>
  askAssistant(message: string, history: ChatTurn[]): Promise<string | null>
  askAgent(a: { tenantId: string; agent: string; conversationId: string; text: string }): Promise<{ reply: string | null; pendingApproval: boolean }>
  save(tenantId: string, contactId: string, text: string, sourceMessageId: string | null): Promise<void>
}

export type DraftOutcome = 'drafted' | 'skipped' | 'off' | 'empty'

export async function draftForEntry(tenantId: string, e: LoggedEntry, d: DraftDeps): Promise<DraftOutcome> {
  if (!shouldDraftFor(e.message.text)) return 'skipped'
  const mode = await d.mode(tenantId)
  if (mode.kind === 'off') return 'off'
  // The message we are answering is already logged; send it as the question, not as history.
  const history = historyFromNotes(await d.notes(e.contactId))
  const last = history.at(-1)
  const prior = last && last.role === 'user' && last.content === e.message.text.split('\nTemplate: ')[0] ? history.slice(0, -1) : history
  let raw: string | null
  if (mode.kind === 'agent') {
    const t = await d.askAgent({ tenantId, agent: mode.agent, conversationId: `wa_${e.contactId}`, text: buildAgentDraftPrompt(e.contactName, e.message.text, prior) })
    // An agent that parks an approval is trying to act, not to write a reply: no draft.
    raw = t.pendingApproval ? null : t.reply
  } else {
    raw = await d.askAssistant(buildDraftPrompt(e.contactName, e.message.text), prior)
  }
  const reply = cleanDraft(raw)
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
