/** Shared handler for the inbound webhook routes, whatever the provider. SERVER-ONLY. */
import { after, NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { crmFor } from '@/lib/crmServer'
import { askAssistant } from '@/lib/aivoryAssistantServer'
import { aivoryTenant } from '@/lib/whatsappConnection'
import { getDraftSetting, saveDraft } from '@/lib/whatsappDrafts'
import { draftForEntry, latestPerContact } from '@/lib/whatsappDraftRunner'
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
        await draftForEntry(tenantId, e, { enabled: async (t) => t === aivoryTenant() && (await getDraftSetting(t)), notes: (id) => crm.listContactActivities(id), ask: askAssistant, save: saveDraft })
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
