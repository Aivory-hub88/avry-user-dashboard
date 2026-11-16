/** The latest AI-drafted reply for a contact (GET), or discard it (DELETE). Drafts are suggestions; nothing here sends. */
import { NextRequest, NextResponse } from 'next/server'
import { ANY_MODULE, requirePaidPlan } from '@/lib/planGate'
import { deleteDraft, getDraft } from '@/lib/whatsappDrafts'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function guard(req: NextRequest) {
  const gate = await requirePaidPlan(req, ANY_MODULE)
  if (!gate.ok) return { response: gate.response } as const
  const contactId = req.nextUrl.searchParams.get('contact_id') ?? ''
  if (!UUID.test(contactId)) return { response: NextResponse.json({ error: 'Unknown contact.' }, { status: 400 }) } as const
  return { userId: gate.user.user_id, contactId } as const
}

export async function GET(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  try {
    return NextResponse.json({ draft: await getDraft(g.userId, g.contactId) })
  } catch (e) {
    console.error('[whatsapp draft get]', (e as Error).message)
    return NextResponse.json({ draft: null })
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  try {
    await deleteDraft(g.userId, g.contactId)
  } catch (e) {
    console.error('[whatsapp draft delete]', (e as Error).message)
    return NextResponse.json({ error: 'Could not discard the draft. Try again.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
