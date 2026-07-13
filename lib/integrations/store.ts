/**
 * In-memory credential vault + connection store.
 *
 * Security contract:
 *  - Credentials are stored in a separate Map keyed by storageRef (opaque UUID).
 *  - AivoryConnection objects NEVER contain credential data.
 *  - GET responses only return AivoryConnection (metadata only).
 *  - Credentials are only accessible server-side via getCredentials().
 *
 * In production: replace the vault Map with AWS Secrets Manager / Vault / encrypted DB column.
 */

import { randomUUID } from 'crypto'
import type {
  AivoryApp,
  AivoryConnection,
  ConnectionStatus,
  CreateConnectionPayload,
} from '@/types/integrations'

// ── App Catalog ──────────────────────────────────────────

export const APP_CATALOG: AivoryApp[] = [
  {
    id: 'slack',
    name: 'Slack',
    // Distinct from deploying an agent INTO Slack as a bot (Agents page):
    // this connects the operator's own account so agent tools can post there.
    description: 'Let your agents post updates and notifications to your Slack workspace.',
    icon: '',
    iconPath: '/integrations/slack.svg',
    authType: 'oauth',
    categories: ['Communication'],
    defaultAction: 'Send Message',
    oauthProvider: 'slack',
    connectLabel: 'Connect Slack',
    oauthScopes: ['chat:write', 'channels:read', 'users:read'],
    fields: [],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Use GPT models for text generation and analysis.',
    icon: '',
    iconPath: '/integrations/openAi.dark.svg',
    authType: 'apiKey',
    categories: ['AI'],
    defaultAction: 'Generate Text',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-...', required: true },
    ],
  },
  {
    id: 'sendgrid',
    name: 'SendGrid',
    description: 'Send transactional and marketing emails.',
    icon: '',
    iconPath: '/integrations/sendGrid.svg',
    authType: 'apiKey',
    categories: ['Communication'],
    defaultAction: 'Send Email',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'SG.xxx', required: true },
    ],
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Read and write Notion databases and pages.',
    icon: '',
    iconPath: '/integrations/notion.dark.svg',
    authType: 'oauth',
    categories: ['Databases'],
    defaultAction: 'Create Page',
    oauthProvider: 'notion',
    connectLabel: 'Connect Notion',
    oauthScopes: ['read_content', 'update_content', 'insert_content'],
    fields: [],
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Sync contacts, deals, and CRM data.',
    icon: '',
    iconPath: '/integrations/hubspot.svg',
    authType: 'oauth',
    categories: ['CRM'],
    defaultAction: 'Create Contact',
    oauthProvider: 'hubspot',
    connectLabel: 'Connect HubSpot',
    oauthScopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write', 'crm.objects.deals.read'],
    fields: [],
  },
  {
    id: 'airtable',
    name: 'Airtable',
    description: 'Read and write Airtable bases and tables.',
    icon: '',
    iconPath: '/integrations/airtable.svg',
    authType: 'oauth',
    categories: ['Databases'],
    defaultAction: 'Create Record',
    oauthProvider: 'airtable',
    connectLabel: 'Connect Airtable',
    oauthScopes: ['data.records:read', 'data.records:write', 'schema.bases:read'],
    fields: [],
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Automate GitHub issues, PRs, and repos.',
    icon: '',
    iconPath: '/integrations/github.dark.svg',
    authType: 'oauth',
    categories: ['DevTools'],
    defaultAction: 'Create Issue',
    oauthProvider: 'github',
    connectLabel: 'Connect GitHub',
    oauthScopes: ['repo', 'read:user', 'user:email'],
    fields: [],
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Create and update Jira issues and projects.',
    icon: '',
    iconPath: '/integrations/jira.svg',
    authType: 'basic',
    categories: ['DevTools'],
    defaultAction: 'Create Issue',
    fields: [
      { key: 'username', label: 'Email', type: 'text', placeholder: 'you@company.com', required: true },
      { key: 'password', label: 'API Token', type: 'password', placeholder: 'ATATT...', required: true },
      { key: 'url', label: 'Jira Base URL', type: 'url', placeholder: 'https://yourorg.atlassian.net', required: true },
    ],
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    description: 'Sync leads, contacts, and opportunities.',
    icon: '',
    iconPath: '/integrations/salesforce.svg',
    authType: 'oauth',
    categories: ['CRM'],
    defaultAction: 'Create Lead',
    oauthProvider: 'salesforce',
    connectLabel: 'Connect Salesforce',
    oauthScopes: ['api', 'refresh_token', 'id'],
    fields: [],
  },
  {
    id: 'http',
    name: 'HTTP / Custom API',
    description: 'Connect to any REST API with an API key.',
    icon: '',
    iconPath: '/integrations/httprequest.dark.svg',
    authType: 'apiKey',
    categories: ['Custom API'],
    defaultAction: 'HTTP Request',
    fields: [
      { key: 'apiKey', label: 'API Key or Bearer Token', type: 'password', placeholder: 'Bearer eyJ...', required: true },
      { key: 'url', label: 'Base URL', type: 'url', placeholder: 'https://api.example.com', required: false },
    ],
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Send and receive emails via Gmail.',
    icon: '',
    iconPath: '/integrations/gmail.svg',
    authType: 'oauth',
    categories: ['Communication'],
    defaultAction: 'Send Email',
    oauthProvider: 'google',
    connectLabel: 'Sign in with Google',
    oauthScopes: ['openid', 'email', 'https://mail.google.com/'],
    fields: [],
  },
  {
    // id must equal the real Composio toolkit slug — this appId is sent
    // straight to Composio on connect with no translation layer.
    id: 'googledrive',
    name: 'Google Drive',
    description: 'Read and write files in Google Drive.',
    icon: '',
    iconPath: '/integrations/googleDrive.svg',
    authType: 'oauth',
    categories: ['Storage'],
    defaultAction: 'Upload File',
    oauthProvider: 'google',
    connectLabel: 'Sign in with Google',
    oauthScopes: ['openid', 'email', 'https://www.googleapis.com/auth/drive'],
    fields: [],
  },
  {
    id: 'googlesheets',
    name: 'Google Sheets',
    description: 'Read and write data in Google Sheets.',
    icon: '',
    iconPath: '/integrations/googleSheets.svg',
    authType: 'oauth',
    categories: ['Databases'],
    defaultAction: 'Write Data',
    oauthProvider: 'google',
    connectLabel: 'Sign in with Google',
    oauthScopes: ['openid', 'email', 'https://www.googleapis.com/auth/spreadsheets'],
    fields: [],
  },
  {
    id: 'googlecalendar',
    name: 'Google Calendar',
    description: 'Create and manage calendar events.',
    icon: '',
    iconPath: '/integrations/googleCalendar.svg',
    authType: 'oauth',
    categories: ['Productivity'],
    defaultAction: 'Create Event',
    oauthProvider: 'google',
    connectLabel: 'Sign in with Google',
    oauthScopes: ['openid', 'email', 'https://www.googleapis.com/auth/calendar'],
    fields: [],
  },
  // Telegram and WhatsApp are deliberately NOT in this catalog: both are
  // deployment channels on the Agents page (bot tokens are server-configured
  // per agent type), not something a user connects their own credentials for
  // here. No agent tool or workflow ever read the old manual entries.
  {
    id: 'discord',
    name: 'Discord',
    description: 'Send messages and notifications to Discord channels.',
    icon: '',
    iconPath: '/integrations/discord.svg',
    authType: 'oauth',
    categories: ['Communication'],
    defaultAction: 'Send Message',
    oauthProvider: 'discord',
    connectLabel: 'Connect Discord',
    oauthScopes: ['identify', 'email', 'guilds', 'bot'],
    fields: [],
  },
  {
    // Composio's slug uses an underscore, not a hyphen.
    id: 'microsoft_teams',
    name: 'Microsoft Teams',
    description: 'Send messages to Microsoft Teams channels.',
    icon: '',
    iconPath: '/integrations/teams.svg',
    authType: 'oauth',
    categories: ['Communication'],
    defaultAction: 'Send Message',
    oauthProvider: 'microsoft',
    connectLabel: 'Sign in with Microsoft',
    oauthScopes: ['openid', 'email', 'profile', 'Chat.ReadWrite', 'ChannelMessage.Send'],
    fields: [],
  },
  {
    id: 'outlook',
    name: 'Outlook',
    description: 'Send and manage emails via Microsoft Outlook.',
    icon: '',
    iconPath: '/integrations/outlook.svg',
    authType: 'oauth',
    categories: ['Communication'],
    defaultAction: 'Send Email',
    oauthProvider: 'microsoft',
    connectLabel: 'Sign in with Microsoft',
    oauthScopes: ['openid', 'email', 'profile', 'Mail.ReadWrite', 'Mail.Send'],
    fields: [],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Process payments and manage subscriptions.',
    icon: '',
    iconPath: '/integrations/stripe.svg',
    authType: 'apiKey',
    categories: ['Finance'],
    defaultAction: 'Create Payment',
    fields: [
      { key: 'apiKey', label: 'Secret API Key', type: 'password', placeholder: 'sk_live_...', required: true },
    ],
  },
  {
    id: 'mailchimp',
    name: 'Mailchimp',
    description: 'Manage email marketing campaigns and audiences.',
    icon: '',
    iconPath: '/integrations/mailchimp.dark.svg',
    authType: 'oauth',
    categories: ['Marketing'],
    defaultAction: 'Add Subscriber',
    oauthProvider: 'mailchimp',
    connectLabel: 'Connect Mailchimp',
    oauthScopes: ['access_full'],
    fields: [],
  },
  {
    id: 'trello',
    name: 'Trello',
    description: 'Create and manage Trello boards, lists, and cards.',
    icon: '',
    iconPath: '/integrations/trello.svg',
    authType: 'oauth',
    categories: ['Productivity'],
    defaultAction: 'Create Card',
    oauthProvider: 'trello',
    connectLabel: 'Connect Trello',
    oauthScopes: ['read', 'write', 'account'],
    fields: [],
  },
  {
    id: 'asana',
    name: 'Asana',
    description: 'Create and manage tasks and projects in Asana.',
    icon: '',
    iconPath: '/integrations/asana.svg',
    authType: 'oauth',
    categories: ['Productivity'],
    defaultAction: 'Create Task',
    oauthProvider: 'asana',
    connectLabel: 'Connect Asana',
    oauthScopes: ['default'],
    fields: [],
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Create and track issues in Linear.',
    icon: '',
    iconPath: '/integrations/linear.svg',
    authType: 'oauth',
    categories: ['DevTools'],
    defaultAction: 'Create Issue',
    oauthProvider: 'linear',
    connectLabel: 'Connect Linear',
    oauthScopes: ['read', 'write', 'issues:create'],
    fields: [],
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    description: 'Store and sync files with Dropbox.',
    icon: '',
    iconPath: '/integrations/dropbox.svg',
    authType: 'oauth',
    categories: ['Storage'],
    defaultAction: 'Upload File',
    oauthProvider: 'dropbox',
    connectLabel: 'Connect Dropbox',
    oauthScopes: ['files.metadata.read', 'files.content.read', 'files.content.write'],
    fields: [],
  },
  {
    id: 'aws-s3',
    name: 'AWS S3',
    description: 'Upload and manage files in Amazon S3 buckets.',
    icon: '',
    iconPath: '/integrations/s3.svg',
    authType: 'apiKey',
    categories: ['Storage'],
    defaultAction: 'Upload File',
    fields: [
      { key: 'accessKeyId', label: 'Access Key ID', type: 'text', placeholder: 'AKIA...', required: true },
      { key: 'secretAccessKey', label: 'Secret Access Key', type: 'password', placeholder: '...', required: true },
      { key: 'bucket', label: 'Bucket Name', type: 'text', placeholder: 'my-bucket', required: true },
    ],
  },
  {
    id: 'twilio',
    name: 'Twilio',
    description: 'Send SMS and voice calls via Twilio.',
    icon: '',
    iconPath: '/integrations/twilio.svg',
    authType: 'apiKey',
    categories: ['Communication'],
    defaultAction: 'Send SMS',
    fields: [
      { key: 'accountSid', label: 'Account SID', type: 'text', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', required: true },
      { key: 'authToken', label: 'Auth Token', type: 'password', placeholder: '...', required: true },
    ],
  },
  {
    id: 'intercom',
    name: 'Intercom',
    description: 'Manage customer conversations and support tickets.',
    icon: '',
    iconPath: '/integrations/intercom.svg',
    authType: 'oauth',
    categories: ['CRM'],
    defaultAction: 'Create Conversation',
    oauthProvider: 'intercom',
    connectLabel: 'Connect Intercom',
    oauthScopes: ['read_users', 'write_users', 'read_conversations', 'write_conversations'],
    fields: [],
  },
  {
    id: 'zendesk',
    name: 'Zendesk',
    description: 'Create and manage customer support tickets.',
    icon: '',
    iconPath: '/integrations/zendesk.svg',
    authType: 'oauth',
    categories: ['CRM'],
    defaultAction: 'Create Ticket',
    oauthProvider: 'zendesk',
    connectLabel: 'Connect Zendesk',
    oauthScopes: ['read', 'write', 'tickets:read', 'tickets:write'],
    fields: [],
  },
  {
    id: 'shopify',
    name: 'Shopify',
    description: 'Manage orders, products, and customers in Shopify.',
    icon: '',
    iconPath: '/integrations/shopify.svg',
    authType: 'oauth',
    categories: ['E-Commerce'],
    defaultAction: 'Create Order',
    oauthProvider: 'shopify',
    connectLabel: 'Connect Shopify',
    oauthScopes: ['read_products', 'write_products', 'read_orders', 'write_orders'],
    fields: [],
  },
]

// ── Credential Vault ─────────────────────────────────────
// storageRef → encrypted/opaque credentials blob
// In production: replace with Secrets Manager / Vault

const credentialVault = new Map<string, Record<string, string>>()

function storeCredentials(credentials: Record<string, string>): string {
  const ref = `vault:${randomUUID()}`
  credentialVault.set(ref, credentials)
  return ref
}

export function updateCredentials(storageRef: string, credentials: Record<string, string>): void {
  credentialVault.set(storageRef, credentials)
}

function purgeCredentials(storageRef: string): void {
  credentialVault.delete(storageRef)
}

/** Server-side only — never call this from a GET handler */
export function getCredentials(storageRef: string): Record<string, string> | undefined {
  return credentialVault.get(storageRef)
}

// ── Connection Store ─────────────────────────────────────
// Map<tenantId, Map<connectionId, AivoryConnection>>

const connectionStore = new Map<string, Map<string, AivoryConnection>>()

function getTenantStore(tenantId: string): Map<string, AivoryConnection> {
  if (!connectionStore.has(tenantId)) connectionStore.set(tenantId, new Map())
  return connectionStore.get(tenantId)!
}

export function listConnections(tenantId: string, appId?: string): AivoryConnection[] {
  const all = Array.from(getTenantStore(tenantId).values())
  return appId ? all.filter(c => c.appId === appId) : all
}

export function getConnection(tenantId: string, id: string): AivoryConnection | undefined {
  return getTenantStore(tenantId).get(id)
}

export function createConnection(
  tenantId: string,
  payload: CreateConnectionPayload,
  options?: { accountIdentifier?: string | null; oauthProvider?: string | null }
): AivoryConnection {
  const app = APP_CATALOG.find(a => a.id === payload.appId)
  if (!app) throw new Error(`Unknown app: ${payload.appId}`)

  const now = new Date().toISOString()
  const storageRef = storeCredentials(payload.credentials)

  const connection: AivoryConnection = {
    id: randomUUID(),
    tenantId,
    appId: payload.appId,
    appName: app.name,
    appIcon: app.icon,
    displayName: payload.displayName,
    status: 'connected',
    authType: app.authType,
    storageRef,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    accountIdentifier: options?.accountIdentifier ?? null,
    oauthProvider: options?.oauthProvider ?? null,
  }

  getTenantStore(tenantId).set(connection.id, connection)
  return connection
}

export function reconnectConnection(
  tenantId: string,
  id: string,
  credentials: Record<string, string>
): AivoryConnection | null {
  const conn = getTenantStore(tenantId).get(id)
  if (!conn) return null

  updateCredentials(conn.storageRef, credentials)
  const updated: AivoryConnection = {
    ...conn,
    status: 'connected',
    updatedAt: new Date().toISOString(),
  }
  getTenantStore(tenantId).set(id, updated)
  return updated
}

export function revokeConnection(tenantId: string, id: string): boolean {
  const conn = getTenantStore(tenantId).get(id)
  if (!conn) return false

  // Purge credentials from vault
  purgeCredentials(conn.storageRef)

  const revoked: AivoryConnection = {
    ...conn,
    status: 'revoked',
    updatedAt: new Date().toISOString(),
  }
  getTenantStore(tenantId).set(id, revoked)
  return true
}

export function touchConnection(tenantId: string, id: string): void {
  const conn = getTenantStore(tenantId).get(id)
  if (conn) {
    getTenantStore(tenantId).set(id, { ...conn, lastUsedAt: new Date().toISOString() })
  }
}
