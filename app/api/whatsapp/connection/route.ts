/**
 * Connect (POST) or disconnect (DELETE) a customer's own Kapso number. The
 * webhook is registered with Kapso using the key they give, which also proves
 * the key works; nothing is saved when that fails.
 */
import { NextRequest, NextResponse } from 'next/server'
import { ANY_MODULE, requirePaidPlan } from '@/lib/planGate'
import { registerWebhook } from '@/lib/kapso'
import { deleteConnection, newWebhookCredentials, saveConnection } from '@/lib/whatsappConnection'

export const runtime = 'nodejs'

function webhookUrl(req: NextRequest, token: string): string {
  const base = process.env.WHATSAPP_WEBHOOK_BASE?.replace(/\/$/, '')
  if (base) return `${base}/api/whatsapp/webhook/${token}`
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost'
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}${req.nextUrl.basePath}/api/whatsapp/webhook/${token}`
}

export async function POST(req: NextRequest) {
  const gate = await requirePaidPlan(req, ANY_MODULE)
  if (!gate.ok) return gate.response
  const b = (await req.json().catch(() => ({}))) as { api_key?: unknown; phone_number_id?: unknown; display_phone?: unknown }
  const apiKey = typeof b.api_key === 'string' ? b.api_key.trim() : ''
  const phoneNumberId = typeof b.phone_number_id === 'string' ? b.phone_number_id.trim() : ''
  const display = typeof b.display_phone === 'string' ? b.display_phone.trim().slice(0, 30) : ''
  if (apiKey.length < 10 || apiKey.length > 300 || /\s/.test(apiKey)) return NextResponse.json({ error: 'That API key doesn’t look right.' }, { status: 400 })
  if (!/^\d{5,30}$/.test(phoneNumberId)) return NextResponse.json({ error: 'The phone number ID is the digits shown next to your number in Kapso.' }, { status: 400 })

  const { token, secret } = newWebhookCredentials()
  const reg = await registerWebhook({ apiKey, phoneNumberId }, webhookUrl(req, token), secret)
  if (!reg.ok) return NextResponse.json({ error: reg.code === 'bad_key' ? 'Kapso rejected that API key or phone number ID.' : reg.message }, { status: reg.code === 'unavailable' ? 502 : 400 })
  try {
    await saveConnection(gate.user.user_id, { apiKey, phoneNumberId, displayPhone: display || null, token, secret })
  } catch (e) {
    console.error('[whatsapp connect] save failed:', (e as Error).message)
    return NextResponse.json({ error: 'Could not save the connection. Try again.' }, { status: 500 })
  }
  return NextResponse.json({ connected: true, mode: 'own', phone: display || null })
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
