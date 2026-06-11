/**
 * POST /api/integrations/oauth/connect
 *
 * Initiates a Composio OAuth connection for a given app and user.
 * Returns a redirectUrl that the frontend opens in a popup.
 *
 * Request body:
 *   { appId: string, userId: string }
 *
 * Success response (200):
 *   { redirectUrl: string }
 *
 * Error response:
 *   { error: { code: string, message: string, details?: string } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getComposioClient, getComposioRedirectUrl } from '@/lib/composio'

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { appId?: string; userId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } },
      { status: 400 }
    )
  }

  const { appId, userId } = body

  if (!appId || typeof appId !== 'string') {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'appId is required' } },
      { status: 400 }
    )
  }
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'userId is required' } },
      { status: 400 }
    )
  }

  try {
    const composio    = getComposioClient()
    const entity      = composio.getEntity(userId)
    const redirectUrl = getComposioRedirectUrl()

    const connectionRequest = await entity.initiateConnection({
      appName:     appId,
      redirectUri: redirectUrl,
    })

    console.log('[integrations/oauth/connect] initiated', {
      userId,
      appId,
      redirectUrl: connectionRequest.redirectUrl,
    })

    return NextResponse.json({
      redirectUrl: connectionRequest.redirectUrl,
      connectionId: connectionRequest.connectedAccountId ?? null,
    })
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : String(err)
    console.error('[integrations/oauth/connect] Composio error:', details)
    return NextResponse.json(
      {
        error: {
          code:    'COMPOSIO_ERROR',
          message: 'Failed to initiate OAuth connection',
          details,
        },
      },
      { status: 500 }
    )
  }
}
