/** Approved templates the account can send (only the ones we can fill from a text box). */
import { NextRequest, NextResponse } from 'next/server'
import { ANY_MODULE, requirePaidPlan } from '@/lib/planGate'
import { getProvider } from '@/lib/whatsapp/providers'
import { getConnection } from '@/lib/whatsappConnection'
import { listTemplates } from '@/lib/whatsappTemplatesServer'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const gate = await requirePaidPlan(req, ANY_MODULE)
  if (!gate.ok) return gate.response
  let conn
  try {
    conn = await getConnection(gate.user.user_id)
  } catch (e) {
    console.error('[whatsapp templates] connection lookup failed:', (e as Error).message)
    return NextResponse.json({ error: 'WhatsApp is unavailable right now. Try again shortly.' }, { status: 503 })
  }
  const provider = conn ? getProvider(conn.provider) : null
  if (!conn || !provider) return NextResponse.json({ error: 'WhatsApp is not connected.', code: 'not_connected' }, { status: 409 })
  const r = await listTemplates(`${gate.user.user_id}:${conn.provider}:${conn.mode}`, provider, conn.creds)
  if (!r.ok) return NextResponse.json({ error: r.message, code: r.code }, { status: r.code === 'unsupported' ? 200 : r.code === 'unavailable' ? 502 : 400 })
  return NextResponse.json({ templates: r.templates.filter((t) => t.usable), hidden: r.templates.filter((t) => !t.usable).length })
}
