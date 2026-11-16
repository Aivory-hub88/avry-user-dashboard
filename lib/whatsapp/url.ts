import type { NextRequest } from 'next/server'

/**
 * The public URL a provider calls. Twilio signs this exact string, so the same
 * function must be used when telling the provider and when verifying.
 */
export function publicWebhookUrl(req: NextRequest, token?: string): string {
  const path = `/api/whatsapp/webhook${token ? `/${token}` : ''}`
  const base = process.env.WHATSAPP_WEBHOOK_BASE?.replace(/\/$/, '')
  if (base) return `${base}${path}`
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost'
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}${req.nextUrl.basePath}${path}`
}
