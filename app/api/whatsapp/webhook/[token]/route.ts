/** Inbound webhook for a customer's own provider account. The token in the path picks the account; the provider's signature authenticates. */
import type { NextRequest } from 'next/server'
import { getConnectionByToken } from '@/lib/whatsappConnection'
import { handleWebhook } from '@/lib/whatsappWebhook'
import { getProvider } from '@/lib/whatsapp/providers'
import { publicWebhookUrl } from '@/lib/whatsapp/url'

export const runtime = 'nodejs'

async function handle(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  let found = null
  try {
    found = /^[0-9a-f]{36}$/.test(token) ? await getConnectionByToken(token) : null
  } catch (e) {
    console.error('[whatsapp webhook] lookup failed:', (e as Error).message)
    return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } })
  }
  const provider = found ? getProvider(found.conn.provider) : null
  return handleWebhook(req, found && provider ? { tenantId: found.userId, provider, creds: found.conn.creds, secret: found.conn.webhookSecret, url: publicWebhookUrl(req, token) } : null)
}

export { handle as POST, handle as GET }
