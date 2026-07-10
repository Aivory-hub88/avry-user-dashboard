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
import { getComposioClient, getComposioRedirectUrl, getOrCreateAuthConfigId } from '@/lib/composio'

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
    const composio     = getComposioClient()
    const redirectUrl  = getComposioRedirectUrl()
    // v3 requires an auth config id; entity.initiateConnection({ appName })
    // no longer exists. link() (not initiate()) is the current method —
    // Composio retired initiate() for Composio-managed OAuth on 2026-07-03.
    const authConfigId = await getOrCreateAuthConfigId(composio, appId)

    const connectionRequest = await composio.connectedAccounts.link(userId, authConfigId, {
      callbackUrl: redirectUrl,
    })

    console.log('[integrations/oauth/connect] initiated', {
      userId,
      appId,
      redirectUrl: connectionRequest.redirectUrl,
    })

    return NextResponse.json({
      redirectUrl: connectionRequest.redirectUrl ?? null,
      connectionId: connectionRequest.id ?? null,
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
