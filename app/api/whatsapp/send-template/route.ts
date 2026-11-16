/** Send an approved template to a CRM contact (works outside the 24-hour window) and log it on their timeline. */
import { NextRequest, NextResponse } from 'next/server'
import { ANY_MODULE, requirePaidPlan } from '@/lib/planGate'
import { whatsappDigits } from '@/lib/crmLabels'
import { sentBody } from '@/lib/crmWhatsapp'
import { crmFor } from '@/lib/crmServer'
import { getProvider } from '@/lib/whatsapp/providers'
import { renderTemplate } from '@/lib/whatsapp/templates'
import { getConnection } from '@/lib/whatsappConnection'
import { deleteDraft } from '@/lib/whatsappDrafts'
import { listTemplates } from '@/lib/whatsappTemplatesServer'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail = (error: string, status: number, code?: string) => NextResponse.json({ error, code }, { status })

export async function POST(req: NextRequest) {
  const gate = await requirePaidPlan(req, ANY_MODULE)
  if (!gate.ok) return gate.response
  const tenant = gate.user.user_id
  const b = (await req.json().catch(() => ({}))) as { contact_id?: unknown; name?: unknown; language?: unknown; params?: unknown }
  if (typeof b.contact_id !== 'string' || !UUID.test(b.contact_id)) return fail('Unknown contact.', 400)
  if (typeof b.name !== 'string' || !/^[a-z0-9_]{1,512}$/.test(b.name)) return fail('Choose a template.', 400)
  if (typeof b.language !== 'string' || !/^[a-z]{2,3}(_[A-Za-z]{2,4})?$/.test(b.language)) return fail('Choose a template.', 400)
  const params = Array.isArray(b.params) ? b.params : []
  if (params.length > 10 || params.some((p) => typeof p !== 'string' || p.length > 1024)) return fail('Those variables are too long.', 400)
  const values = (params as string[]).map((p) => p.trim())
  if (values.some((p) => p === '')) return fail('Fill in every variable.', 400)

  let conn
  try {
    conn = await getConnection(tenant)
  } catch (e) {
    console.error('[whatsapp send-template] connection lookup failed:', (e as Error).message)
    return fail('WhatsApp is unavailable right now. Try again shortly.', 503)
  }
  const provider = conn ? getProvider(conn.provider) : null
  if (!conn || !provider?.templates) return fail('WhatsApp templates are not available for this connection.', 409, 'unsupported')

  // The template must be in the account's approved, usable list, with the right number of variables.
  const list = await listTemplates(`${tenant}:${conn.provider}:${conn.mode}`, provider, conn.creds)
  if (!list.ok) return fail(list.message, list.code === 'unavailable' ? 502 : 400, list.code)
  const tpl = list.templates.find((t) => t.name === b.name && t.language === b.language && t.usable)
  if (!tpl) return fail('That template is not available.', 404)
  if (values.length !== tpl.params) return fail(`This template needs ${tpl.params} variable${tpl.params === 1 ? '' : 's'}.`, 400)

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

  const sent = await provider.templates.send(conn.creds, to, tpl.name, tpl.language, values)
  if (!sent.ok) return fail(sent.message, sent.code === 'unavailable' ? 502 : 400, sent.code)

  let logged = true
  try {
    await crm.createActivity({ kind: 'note', subject_type: 'contact', subject_id: contact.id, body: sentBody(renderTemplate(tpl.body, values), { template: tpl.name }) })
  } catch (e) {
    logged = false
    console.error('[whatsapp send-template] sent but not logged:', (e as Error).message)
  }
  await deleteDraft(tenant, contact.id).catch(() => {})
  return NextResponse.json({ ok: true, logged })
}
