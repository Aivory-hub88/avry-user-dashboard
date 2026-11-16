/** Inbound webhook for the Aivory-owned number (env-configured). Public; authenticated by signature. */
import type { NextRequest } from 'next/server'
import { aivoryConnection, aivoryTenant } from '@/lib/whatsappConnection'
import { handleWebhook } from '@/lib/whatsappWebhook'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const conn = aivoryConnection()
  const tenantId = aivoryTenant()
  return handleWebhook(req, conn && tenantId ? { tenantId, secret: conn.webhookSecret } : null)
}
