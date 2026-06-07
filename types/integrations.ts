export type AuthType = 'apiKey' | 'basic' | 'oauth'
export type ConnectionStatus = 'connected' | 'revoked' | 'needs_reauth'

export interface OAuthProviderConfig {
  provider: string           // e.g. 'google', 'slack', 'github'
  connectLabel: string       // e.g. 'Sign in with Google'
  scopes: string[]           // e.g. ['openid', 'email', 'https://mail.google.com/']
  authorizationUrl: string   // provider's authorize endpoint
  tokenUrl: string           // provider's token endpoint
  userinfoUrl?: string       // provider's userinfo endpoint
  revocationUrl?: string     // provider's token revocation endpoint
}

export interface AivoryApp {
  id: string
  name: string
  description: string
  icon: string          // emoji fallback
  iconPath?: string     // path to SVG in /public/integrations/icons/
  authType: AuthType
  categories: string[]
  defaultAction?: string  // default action name for canvas nodes
  fields: AppField[]
  // OAuth-specific (present when authType === 'oauth')
  oauthProvider?: string
  connectLabel?: string
  oauthScopes?: string[]
}

export interface AppField {
  key: string
  label: string
  type: 'text' | 'password' | 'url'
  placeholder?: string
  required: boolean
}

/** Safe metadata returned to clients — NO credentials */
export interface AivoryConnection {
  id: string
  tenantId: string
  appId: string
  appName: string
  appIcon: string
  displayName: string
  status: ConnectionStatus
  authType: AuthType
  storageRef: string    // opaque reference to where credentials live in the vault
  createdAt: string
  updatedAt: string
  lastUsedAt: string | null
  // OAuth-specific extensions
  accountIdentifier?: string | null
  oauthProvider?: string | null
}

/** What the client sends to create/update a connection */
export interface CreateConnectionPayload {
  appId: string
  displayName: string
  credentials: Record<string, string>
}
