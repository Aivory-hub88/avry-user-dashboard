/** Per-account WhatsApp settings. Today: whether the Aivory assistant drafts replies to incoming messages (off by default). */
import { NextRequest, NextResponse } from 'next/server'
import { ANY_MODULE, requirePaidPlan } from '@/lib/planGate'
import { getDraftSetting, setDraftSetting } from '@/lib/whatsappDrafts'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const gate = await requirePaidPlan(req, ANY_MODULE)
  if (!gate.ok) return gate.response
  try {
    return NextResponse.json({ draft_replies: await getDraftSetting(gate.user.user_id) })
  } catch (e) {
    console.error('[whatsapp settings get]', (e as Error).message)
    return NextResponse.json({ draft_replies: false })
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requirePaidPlan(req, ANY_MODULE)
  if (!gate.ok) return gate.response
  const b = (await req.json().catch(() => ({}))) as { draft_replies?: unknown }
  if (typeof b.draft_replies !== 'boolean') return NextResponse.json({ error: 'draft_replies must be true or false.' }, { status: 400 })
  try {
    await setDraftSetting(gate.user.user_id, b.draft_replies)
  } catch (e) {
    console.error('[whatsapp settings put]', (e as Error).message)
    return NextResponse.json({ error: 'Could not save the setting. Try again.' }, { status: 500 })
  }
  return NextResponse.json({ draft_replies: b.draft_replies })
}
