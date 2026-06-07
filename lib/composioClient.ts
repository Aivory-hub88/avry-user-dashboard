import { Composio } from 'composio-core'

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY || '',
})

/** Provider config key mapping: AVRY appId → Composio toolkit slug */
const PROVIDER_MAP: Record<string, string> = {
  'gmail':           'gmail',
  'google-drive':    'googledrive',
  'google-sheets':   'googlesheets',
  'google-calendar': 'googlecalendar',
  'microsoft-teams': 'microsoftteams',
  'outlook':         'outlook',
  'slack':           'slack',
  'github':          'github',
  'discord':         'discord',
  'dropbox':         'dropbox',
  'hubspot':         'hubspot',
  'salesforce':      'salesforce',
  'notion':          'notion',
  'trello':          'trello',
  'asana':           'asana',
  'linear':          'linear',
  'airtable':        'airtable',
  'shopify':         'shopify',
  'mailchimp':       'mailchimp',
  'intercom':        'intercom',
  'zendesk':         'zendesk',
}

export function getProviderConfigKey(appId: string): string | null {
  return PROVIDER_MAP[appId] ?? null
}

export function buildConnectionId(tenantId: string, appId: string): string {
  return `${tenantId}:${appId}`
}

export async function initiateAuth(toolkitSlug: string, connectionId: string) {
  // Step 1: get or create authConfig for this toolkit
  const authConfigsList = await (composio as any).authConfigs.list({ toolkit: toolkitSlug })
  const authConfigs = (authConfigsList as any).items || []

  if (authConfigs.length === 0) {
    throw new Error(`No auth config found for toolkit: ${toolkitSlug}. Please create one at app.composio.dev`)
  }

  const authConfigId = authConfigs[0].id

  // Step 2: initiate connection
  const result = await (composio.connectedAccounts.initiate as any)(
    connectionId,
    authConfigId,
    { redirectUri: process.env.COMPOSIO_REDIRECT_URL || '' }
  )

  return {
    url: result?.redirectUrl || result?.connectionUrl || result?.url || ''
  }
}

export async function getToken(toolkitSlug: string, connectionId: string) {
  const accounts = await (composio.connectedAccounts as any).list({ userIds: [connectionId] })
  const account = (accounts as any).items?.find(
    (a: any) => a.toolkitSlug === toolkitSlug || a.appName === toolkitSlug
  )
  if (!account) throw new Error('No connected account found')
  return {
    accessToken: account.accessToken || '',
    tokenType: 'Bearer',
    expiresAt: account.expiresAt ? new Date(account.expiresAt).toISOString() : null,
  }
}

export async function deleteConnection(toolkitSlug: string, connectionId: string) {
  const accounts = await (composio.connectedAccounts as any).list({ userIds: [connectionId] })
  const account = (accounts as any).items?.find(
    (a: any) => a.toolkitSlug === toolkitSlug || a.appName === toolkitSlug
  )
  if (account?.id) {
    await composio.connectedAccounts.delete(account.id)
  }
}

export async function getConnection(toolkitSlug: string, connectionId: string) {
  const accounts = await (composio.connectedAccounts as any).list({ userIds: [connectionId] })
  return (accounts as any).items?.find(
    (a: any) => a.toolkitSlug === toolkitSlug || a.appName === toolkitSlug
  ) || null
}

export { composio }
