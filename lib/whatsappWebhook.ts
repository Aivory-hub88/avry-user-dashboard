/** Shared handler for the inbound webhook routes, whatever the provider. SERVER-ONLY. */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { crmFor } from '@/lib/crmServer'
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
    const result = await logInbound(crmFor(target.tenantId), msgs, seen)
    return ok() ?? NextResponse.json({ ok: true, ...result })
  } catch (e) {
    // 5xx so the provider retries; messages already logged are skipped by id.
    console.error('[whatsapp webhook] CRM write failed:', (e as Error).message)
    return NextResponse.json({ error: 'crm_unavailable' }, { status: 502 })
  }
}
