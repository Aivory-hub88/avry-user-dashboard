/** Inbound webhook for a customer's own Kapso number. The token in the path picks the account; the signature authenticates. */
import type { NextRequest } from 'next/server'
import { getConnectionByToken } from '@/lib/whatsappConnection'
import { handleWebhook } from '@/lib/whatsappWebhook'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  let found = null
  try {
    found = /^[0-9a-f]{36}$/.test(token) ? await getConnectionByToken(token) : null
  } catch (e) {
    console.error('[whatsapp webhook] lookup failed:', (e as Error).message)
    return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } })
  }
  return handleWebhook(req, found ? { tenantId: found.userId, secret: found.conn.webhookSecret } : null)
}
