/** Inbound webhook for the Aivory-owned number (env-configured, Kapso). Public; authenticated by signature. */
import type { NextRequest } from 'next/server'
import { aivoryConnection, aivoryTenant } from '@/lib/whatsappConnection'
import { handleWebhook } from '@/lib/whatsappWebhook'
import { getProvider } from '@/lib/whatsapp/providers'
import { publicWebhookUrl } from '@/lib/whatsapp/url'

export const runtime = 'nodejs'

async function handle(req: NextRequest) {
  const conn = aivoryConnection()
  const tenantId = aivoryTenant()
  const provider = conn ? getProvider(conn.provider) : null
  return handleWebhook(req, conn && tenantId && provider ? { tenantId, provider, creds: conn.creds, secret: conn.webhookSecret, url: publicWebhookUrl(req) } : null)
}

export { handle as POST, handle as GET }
