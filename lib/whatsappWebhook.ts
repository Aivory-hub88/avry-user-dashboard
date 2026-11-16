/** Shared handler for the two inbound webhook routes. SERVER-ONLY. */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { INBOUND_EVENT, parseInbound, verifySignature } from '@/lib/kapso'
import { crmFor } from '@/lib/crmServer'
import { logInbound, SeenIds } from '@/lib/whatsappInbound'

const g = globalThis as unknown as { __waSeen?: SeenIds }
const seen = (g.__waSeen ??= new SeenIds())

export async function handleWebhook(req: NextRequest, target: { tenantId: string; secret: string } | null): Promise<NextResponse> {
  // Unknown token or unconfigured number: same answer, nothing to learn.
  if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const raw = await req.text()
  if (!verifySignature(raw, req.headers.get('x-webhook-signature'), target.secret)) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 })
  }
  const event = req.headers.get('x-webhook-event')
  if (event && event !== INBOUND_EVENT) return NextResponse.json({ ok: true, ignored: event })
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 })
  }
  try {
    const result = await logInbound(crmFor(target.tenantId), parseInbound(body), seen)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    // 5xx so Kapso retries; messages already logged are skipped by id.
    console.error('[whatsapp webhook] CRM write failed:', (e as Error).message)
    return NextResponse.json({ error: 'crm_unavailable' }, { status: 502 })
  }
}
