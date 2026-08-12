/**
 * Read-only connected-apps lookup for the agent Customize modal's
 * Connections tab. Deliberately thin — connect/revoke stays on the full
 * /integrations page (deep-linked to, not embedded here); this just
 * answers "what does this operator already have connected."
 */

import { asset } from './asset'

export interface ConnectedApp {
  id: string
  appId: string
  appName: string
  displayName: string
  status: 'connected' | 'revoked' | 'needs_reauth'
}

export async function getConnectedApps(): Promise<ConnectedApp[]> {
  const res = await fetch(asset('/api/integrations/oauth?action=status'))
  if (!res.ok) throw new Error(`Failed to load connections (${res.status})`)
  return res.json()
}
