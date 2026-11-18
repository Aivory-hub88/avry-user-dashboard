/** Shared handler for the inbound webhook routes, whatever the provider. SERVER-ONLY. */
import { after, NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { crmFor } from '@/lib/crmServer'
import { askAssistant } from '@/lib/aivoryAssistantServer'
import { AGENT_NAMES } from '@/lib/agentRoster'
import { runAgentTurn } from '@/lib/agentTurnServer'
import { sentBody } from '@/lib/crmWhatsapp'
import { getProvider } from '@/lib/whatsapp/providers'
import { aivoryTenant, getConnection } from '@/lib/whatsappConnection'
import { withoutAgentMessages } from '@/lib/whatsappAgentForward'
import { countAutoReplies, deleteDraft, getDraftConfig, recordAutoReply, saveDraft } from '@/lib/whatsappDrafts'
import { draftForEntry, latestPerContact, type DraftMode } from '@/lib/whatsappDraftRunner'
import type { LoggedEntry } from '@/lib/whatsappInbound'
import { logInbound, SeenIds } from '@/lib/whatsappInbound'
import type { Provider } from '@/lib/whatsapp/providers'
import type { Creds } from '@/lib/whatsapp/types'

const g = globalThis as unknown as { __waSeen?: SeenIds }
const seen = (g.__waSeen ??= new SeenIds())

export type WebhookTarget = { tenantId: string; provider: Provider; creds: Creds; secret: string; url: string }

export async function handleWebhook(req: NextRequest, target: WebhookTarget | null): Promise<NextResponse> {
  // Unknown token or unconfigured number: same answer, nothing to learn.
  if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const { provider } = target

  if (req.method === 'GET') {
    const answer = provider.challenge?.(req.nextUrl.searchParams, target.secret) ?? null
    return answer === null ? NextResponse.json({ error: 'forbidden' }, { status: 403 }) : new NextResponse(answer, { status: 200, headers: { 'content-type': 'text/plain' } })
  }

  const ctx = { raw: await req.text(), headers: req.headers, url: target.url }
  if (!provider.verify(ctx, target.creds, target.secret)) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 })
  }
  const ok = () => (provider.ack ? new NextResponse(provider.ack.body, { status: 200, headers: { 'content-type': provider.ack.type } }) : null)
  if (provider.wanted && !provider.wanted(ctx)) return ok() ?? NextResponse.json({ ok: true, ignored: true })
  let msgs
  try {
    msgs = provider.parse(ctx)
  } catch {
    return NextResponse.json({ error: 'bad_payload' }, { status: 400 })
  }
  // Agent deploys live on Aivory's shared number only; a tenant's own number is all CRM.
  if (target.tenantId === aivoryTenant()) msgs = await withoutAgentMessages(msgs)
  try {
    const crm = crmFor(target.tenantId)
    const result = await logInbound(crm, msgs, seen)
    scheduleDrafts(target.tenantId, crm, result.entries)
    return ok() ?? NextResponse.json({ ok: true, logged: result.logged, created: result.created, duplicates: result.duplicates })
  } catch (e) {
    // 5xx so the provider retries; messages already logged are skipped by id.
    console.error('[whatsapp webhook] CRM write failed:', (e as Error).message)
    return NextResponse.json({ error: 'crm_unavailable' }, { status: 502 })
  }
}

/**
 * AI drafts take several seconds, longer than the 10 s a provider waits for our answer, so they run after
 * the response. Off by default per account; nothing is ever sent from here.
 */
function scheduleDrafts(tenantId: string, crm: ReturnType<typeof crmFor>, entries: Parameters<typeof latestPerContact>[0]) {
  if (entries.length === 0) return
  const work = async () => {
    for (const e of latestPerContact(entries)) {
      try {
        await draftForEntry(tenantId, e, { mode: draftMode, notes: (id) => crm.listContactActivities(id), askAssistant, askAgent: (a) => runAgentTurn({ tenantId: a.tenantId, agentType: a.agent, conversationId: a.conversationId, text: a.text }), counts: countAutoReplies, autoSend: (t, entry, text, label) => autoSend(crm, t, entry, text, label), save: saveDraft })
      } catch (err) {
        console.error('[whatsapp draft] failed:', (err as Error).message)
      }
    }
  }
  try {
    after(work)
  } catch {
    // Outside a request scope (tests): run it without holding the response.
    void work()
  }
}

/**
 * Switch off -> nobody. An agent chosen -> that agent (the customer's own). No agent -> Aivory's assistant, on Aivory's
 * own number only. Approval mode drafts for a person; autonomous mode sends within the guardrails in whatsappAutoRules.
 */
async function draftMode(tenantId: string): Promise<DraftMode> {
  const c = await getDraftConfig(tenantId)
  if (!c.draftReplies) return { kind: 'off' }
  const autonomous = c.replyMode === 'autonomous'
  if (c.agent) return { kind: 'agent', agent: c.agent, label: (AGENT_NAMES as Record<string, string>)[c.agent] ?? c.agent, autonomous }
  return tenantId === aivoryTenant() ? { kind: 'assistant', label: 'Aivory assistant', autonomous } : { kind: 'off' }
}

/** Sends an automatic reply through the account's own connection and logs it as automatic. Never throws. */
async function autoSend(crm: ReturnType<typeof crmFor>, tenantId: string, e: LoggedEntry, text: string, label: string): Promise<{ ok: boolean }> {
  try {
    const conn = await getConnection(tenantId)
    const provider = conn ? getProvider(conn.provider) : null
    if (!conn || !provider) return { ok: false }
    const sent = await provider.send(conn.creds, e.message.from, text)
    if (!sent.ok) return { ok: false }
    // The message is out; bookkeeping failures must not turn it into a "not sent".
    await crm.createActivity({ kind: 'note', subject_type: 'contact', subject_id: e.contactId, body: sentBody(text, { autoBy: label }) }).catch((err) => console.error('[whatsapp auto] sent but not logged:', (err as Error).message))
    await recordAutoReply(tenantId, e.contactId).catch((err) => console.error('[whatsapp auto] counter failed:', (err as Error).message))
    await deleteDraft(tenantId, e.contactId).catch(() => {})
    return { ok: true }
  } catch (err) {
    console.error('[whatsapp auto] send failed:', (err as Error).message)
    return { ok: false }
  }
}
