/** Is WhatsApp connected for this account, and through which number? Never returns a key. */
import { NextRequest, NextResponse } from 'next/server'
import { ANY_MODULE, requirePaidPlan } from '@/lib/planGate'
import { getConnection } from '@/lib/whatsappConnection'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const gate = await requirePaidPlan(req, ANY_MODULE)
  if (!gate.ok) return gate.response
  try {
    const c = await getConnection(gate.user.user_id)
    return NextResponse.json({ connected: !!c, mode: c?.mode ?? null, phone: c?.displayPhone ?? null })
  } catch (e) {
    console.error('[whatsapp status]', (e as Error).message)
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }
}
