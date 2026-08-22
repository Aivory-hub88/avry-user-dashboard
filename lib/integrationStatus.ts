/**
 * OAuth connect/reconnect/revoke for the agent Customize modal's
 * Connections tab — the same underlying Composio-backed API the full
 * /integrations page uses (session -> connect -> popup -> poll, revoke via
 * the oauth route's `action: 'revoke'`), so a user can wire up HubSpot/
 * Slack/Zendesk/Asana etc. without leaving the agent modal. Scoped to OAuth
 * apps only, matching `getConnectedApps()`'s own `oauth?action=status`
 * source — manual/API-key connections are a separate credential vault
 * (workflow-canvas nodes) and stay on the full Integrations page.
 */

import { asset } from './asset'

export interface ConnectedApp {
  id: string
  appId: string
  appName: string
  displayName: string
  status: 'connected' | 'revoked' | 'needs_reauth'
}

export interface ConnectableApp {
  id: string
  name: string
  description: string
  icon: string
  iconPath?: string
  authType: 'apiKey' | 'basic' | 'oauth'
  connectLabel?: string
}

export async function getConnectedApps(): Promise<ConnectedApp[]> {
  const res = await fetch(asset('/api/integrations/oauth?action=status'))
  if (!res.ok) throw new Error(`Failed to load connections (${res.status})`)
  return res.json()
}

export async function getConnectableApps(): Promise<ConnectableApp[]> {
  const res = await fetch(asset('/api/integrations/apps'))
  if (!res.ok) throw new Error(`Failed to load available apps (${res.status})`)
  const apps: ConnectableApp[] = await res.json()
  return apps.filter((a) => a.authType === 'oauth')
}

/** Opens the provider's OAuth popup; caller polls `getConnectedApps()` to
 *  learn when it completes (same "session -> connect -> popup" shape the
 *  full /integrations page's own polling uses). */
export async function startOAuthConnect(appId: string): Promise<Window | null> {
  const sessionRes = await fetch(asset('/api/integrations/oauth?action=session'))
  if (!sessionRes.ok) throw new Error('Failed to create session')

  const connectRes = await fetch(asset('/api/integrations/oauth/connect'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId }),
  })
  if (!connectRes.ok) throw new Error('Failed to initiate connection')
  const { redirectUrl } = await connectRes.json()
  if (!redirectUrl) throw new Error('No redirect URL returned')

  return window.open(redirectUrl, 'composio-oauth', 'width=600,height=700')
}

export async function revokeConnectedApp(connectedAccountId: string): Promise<void> {
  const res = await fetch(asset('/api/integrations/oauth'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'revoke', connectedAccountId }),
  })
  if (!res.ok) throw new Error('Failed to revoke connection')
}

/**
 * Connect an API-key toolkit (no OAuth popup exists for that scheme) by
 * submitting the toolkit's credential fields to the apikey/connect route,
 * which creates the Composio connected account server-side for the current
 * user. Caller polls `getConnectedApps()` afterwards, same as OAuth.
 */
export async function startApiKeyConnect(
  toolkit: string,
  fields: Record<string, string>,
): Promise<void> {
  const res = await fetch(asset('/api/integrations/apikey/connect'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toolkit, fields }),
  })
  if (!res.ok) {
    let message = 'Failed to connect'
    try {
      const parsed = await res.json()
      if (parsed?.error?.message) message = String(parsed.error.message)
    } catch {
      /* keep generic */
    }
    throw new Error(message)
  }
}
