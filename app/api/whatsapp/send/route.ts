/** Send a WhatsApp text to a CRM contact and log it on their timeline. */
import { NextRequest, NextResponse } from 'next/server'
import { ANY_MODULE, requirePaidPlan } from '@/lib/planGate'
import { MAX_TEXT } from '@/lib/whatsapp/types'
import { getProvider } from '@/lib/whatsapp/providers'
import { whatsappDigits } from '@/lib/crmLabels'
import { sentBody } from '@/lib/crmWhatsapp'
import { crmFor } from '@/lib/crmServer'
import { getConnection } from '@/lib/whatsappConnection'
import { deleteDraft } from '@/lib/whatsappDrafts'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail = (error: string, status: number, code?: string) => NextResponse.json({ error, code }, { status })

export async function POST(req: NextRequest) {
  const gate = await requirePaidPlan(req, ANY_MODULE)
  if (!gate.ok) return gate.response
  const tenant = gate.user.user_id
  const b = (await req.json().catch(() => ({}))) as { contact_id?: unknown; text?: unknown }
  const text = typeof b.text === 'string' ? b.text.trim() : ''
  if (typeof b.contact_id !== 'string' || !UUID.test(b.contact_id)) return fail('Unknown contact.', 400)
  if (!text) return fail('Write a message first.', 400)
  if (text.length > MAX_TEXT) return fail(`Messages can be up to ${MAX_TEXT} characters.`, 400)

  let conn
  try {
    conn = await getConnection(tenant)
  } catch (e) {
    console.error('[whatsapp send] connection lookup failed:', (e as Error).message)
    return fail('WhatsApp is unavailable right now. Try again shortly.', 503)
  }
  if (!conn) return fail('WhatsApp is not connected.', 409, 'not_connected')

  const crm = crmFor(tenant)
  let contact
  try {
    contact = await crm.getContact(b.contact_id)
  } catch {
    return fail('The CRM is unavailable right now. Try again shortly.', 502)
  }
  if (!contact) return fail('Unknown contact.', 404)
  const to = whatsappDigits(contact.phone)
  if (!to) return fail('This contact has no valid phone number.', 400, 'no_phone')

  const provider = getProvider(conn.provider)
  if (!provider) return fail('WhatsApp is not connected.', 409, 'not_connected')
  const sent = await provider.send(conn.creds, to, text)
  if (!sent.ok) return fail(sent.message, sent.code === 'unavailable' ? 502 : sent.code === 'window_closed' ? 409 : 400, sent.code)

  // The message is out; a logging failure must not look like a send failure.
  let logged = true
  try {
    await crm.createActivity({ kind: 'note', subject_type: 'contact', subject_id: contact.id, body: sentBody(text) })
  } catch (e) {
    logged = false
    console.error('[whatsapp send] sent but not logged:', (e as Error).message)
  }
  // A reply went out, so the suggestion it was based on is stale.
  await deleteDraft(tenant, contact.id).catch(() => {})
  return NextResponse.json({ ok: true, logged })
}
