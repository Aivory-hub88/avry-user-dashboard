/**
 * Answers the latest inbound message of a contact, when the account has turned this on. In approval mode a draft is
 * stored for a person to send. In autonomous mode the reply is sent, unless a guardrail holds it back (then it becomes
 * a draft with the reason). Dependencies are injected so the decision logic is testable.
 */
import type { LoggedEntry } from './whatsappInbound'
import { HOLD_TEXT, holdReason } from './whatsappAutoRules'
import { buildAgentDraftPrompt, buildDraftPrompt, cleanDraft, historyFromNotes, shouldDraftFor, type ChatTurn } from './whatsappDraftPrompt'

/**
 * Who writes the reply: nobody, Aivory's own assistant (Aivory's number only), or the customer's agent.
 * `autonomous` sends the reply (within guardrails); otherwise it is a draft for a person to approve.
 * `label` is the writer's display name ("Lex", "Aivory assistant").
 */
export type DraftMode = { kind: 'off' } | { kind: 'assistant'; label: string; autonomous: boolean } | { kind: 'agent'; agent: string; label: string; autonomous: boolean }

export type DraftDeps = {
  mode(tenantId: string): Promise<DraftMode>
  notes(contactId: string): Promise<{ kind: string; body: string | null; occurred_at: string }[]>
  askAssistant(message: string, history: ChatTurn[]): Promise<string | null>
  askAgent(a: { tenantId: string; agent: string; conversationId: string; text: string }): Promise<{ reply: string | null; pendingApproval: boolean }>
  counts(tenantId: string, contactId: string): Promise<{ contactCount: number; accountCount: number }>
  /** Sends the reply and logs it as an automatic one; `ok: false` means it did not go out. */
  autoSend(tenantId: string, e: LoggedEntry, text: string, label: string): Promise<{ ok: boolean }>
  save(tenantId: string, contactId: string, text: string, sourceMessageId: string | null, writer: string | null, note: string | null): Promise<void>
}

export type DraftOutcome = 'drafted' | 'sent' | 'held' | 'skipped' | 'off' | 'empty'

export async function draftForEntry(tenantId: string, e: LoggedEntry, d: DraftDeps): Promise<DraftOutcome> {
  if (!shouldDraftFor(e.message.text)) return 'skipped'
  const mode = await d.mode(tenantId)
  if (mode.kind === 'off') return 'off'
  // The message we are answering is already logged; send it as the question, not as history.
  const notes = await d.notes(e.contactId)
  const history = historyFromNotes(notes)
  const last = history.at(-1)
  const prior = last && last.role === 'user' && last.content === e.message.text ? history.slice(0, -1) : history
  let raw: string | null
  if (mode.kind === 'agent') {
    const t = await d.askAgent({ tenantId, agent: mode.agent, conversationId: `wa_${e.contactId}`, text: buildAgentDraftPrompt(e.contactName, e.message.text, prior) })
    // An agent that parks an approval is trying to act, not to write a reply: no reply at all.
    raw = t.pendingApproval ? null : t.reply
  } else {
    raw = await d.askAssistant(buildDraftPrompt(e.contactName, e.message.text), prior)
  }
  const reply = cleanDraft(raw)
  if (!reply) return 'empty'

  if (mode.autonomous) {
    let hold = holdReason({ latest: e.message.text, notes, ...(await d.counts(tenantId, e.contactId)) })
    if (!hold) {
      if ((await d.autoSend(tenantId, e, reply, mode.label)).ok) return 'sent'
      hold = 'send_failed'
    }
    // Not sent: keep it as a draft for a person, with the reason.
    await d.save(tenantId, e.contactId, reply, e.message.id, mode.label, HOLD_TEXT[hold])
    return 'held'
  }
  await d.save(tenantId, e.contactId, reply, e.message.id, mode.label, null)
  return 'drafted'
}

/** One entry per contact (their latest message), so a burst of messages gets one draft. */
export function latestPerContact(entries: LoggedEntry[]): LoggedEntry[] {
  const m = new Map<string, LoggedEntry>()
  for (const e of entries) m.set(e.contactId, e)
  return [...m.values()]
}
