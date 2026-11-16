/**
 * Connect (POST) or disconnect (DELETE) a customer's own WhatsApp provider account.
 * Providers Aivory can wire up (Kapso) get their webhook registered with the key the
 * customer gave, which also proves it works; nothing is saved when that fails. For the
 * others the response carries the steps (and URL/token) to paste into the provider's console.
 */
import { NextRequest, NextResponse } from 'next/server'
import { ANY_MODULE, requirePaidPlan } from '@/lib/planGate'
import { checkCreds, providerMeta } from '@/lib/whatsapp/providerMeta'
import { getProvider } from '@/lib/whatsapp/providers'
import { publicWebhookUrl } from '@/lib/whatsapp/url'
import type { ProviderId } from '@/lib/whatsapp/types'
import { deleteConnection, newWebhookCredentials, saveConnection } from '@/lib/whatsappConnection'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const gate = await requirePaidPlan(req, ANY_MODULE)
  if (!gate.ok) return gate.response
  const b = (await req.json().catch(() => ({}))) as { provider?: unknown; credentials?: unknown; display_phone?: unknown }
  const meta = typeof b.provider === 'string' ? providerMeta(b.provider) : undefined
  const provider = meta ? getProvider(meta.id) : null
  if (!meta || !provider) return NextResponse.json({ error: 'Choose a WhatsApp provider.' }, { status: 400 })
  const { creds, problem } = checkCreds(meta.id as ProviderId, (b.credentials && typeof b.credentials === 'object' ? b.credentials : {}) as Record<string, unknown>)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  const display = typeof b.display_phone === 'string' ? b.display_phone.trim().slice(0, 30) : ''

  const { token, secret } = newWebhookCredentials()
  const url = publicWebhookUrl(req, token)
  if (provider.autoRegister) {
    const reg = await provider.autoRegister(creds, url, secret)
    if (!reg.ok) return NextResponse.json({ error: reg.code === 'bad_key' ? `${meta.label} rejected those credentials.` : reg.message }, { status: reg.code === 'unavailable' ? 502 : 400 })
  }
  try {
    await saveConnection(gate.user.user_id, { provider: meta.id, creds, displayPhone: display || null, token, secret })
  } catch (e) {
    console.error('[whatsapp connect] save failed:', (e as Error).message)
    return NextResponse.json({ error: 'Could not save the connection. Try again.' }, { status: 500 })
  }
  return NextResponse.json({ connected: true, mode: 'own', provider: meta.id, phone: display || null, setup: meta.webhook === 'manual' ? meta.steps(url, secret) : [] })
}

export async function DELETE(req: NextRequest) {
  const gate = await requirePaidPlan(req, ANY_MODULE)
  if (!gate.ok) return gate.response
  try {
    await deleteConnection(gate.user.user_id)
  } catch (e) {
    console.error('[whatsapp disconnect]', (e as Error).message)
    return NextResponse.json({ error: 'Could not disconnect. Try again.' }, { status: 500 })
  }
  return NextResponse.json({ connected: false })
}
