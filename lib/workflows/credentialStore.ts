/**
 * Credential Store — persists and retrieves n8n credentials.
 *
 * Supports two storage backends:
 *   - localStorage (browser-only, immediate — always written, regardless of preference)
 *   - database (PATCH /api/user/credentials, encrypted server-side —
 *     see lib/workflows/n8nCredentialsServer.ts)
 *
 * This module runs client-side only.
 */
import { asset } from '@/lib/asset'

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface N8nCredentials {
  instanceUrl: string
  apiKey: string
  storagePreference: 'localStorage' | 'database'
  /**
   * Superadmin-only: deploy into Aivory's own self-hosted n8n instead of a
   * user-supplied instance. When set, `instanceUrl`/`apiKey` are ignored and
   * nothing is persisted — the server resolves the instance from its own env
   * after re-checking the caller's JWT. The client flag is a UI affordance
   * only; it grants nothing on its own.
   */
  useAivoryInstance?: boolean
}

export interface StoredCredentials {
  instanceUrl: string
  apiKey: string
  storageType: 'localStorage' | 'database'
}

/** Internal shape persisted to localStorage */
interface PersistedCredentials {
  instanceUrl: string
  apiKey: string
  storageType: 'localStorage' | 'database'
  updatedAt: string // ISO timestamp
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CRED_KEY = 'aivory_n8n_credentials'

// ── URL Validation ────────────────────────────────────────────────────────────

/**
 * Returns true only for valid http: or https: protocol URLs.
 * All other strings (empty, whitespace, ftp://, relative paths, malformed) return false.
 */
export function isValidN8nUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * n8n editor-UI route prefixes. When a pasted URL's path starts with one of
 * these, everything from that segment onward is UI routing, not part of the
 * instance's base URL.
 */
const N8N_UI_ROUTES = [
  'workflow', 'workflows', 'home', 'projects', 'executions', 'execution',
  'credentials', 'settings', 'signin', 'setup', 'templates', 'variables',
]

/**
 * Normalise whatever the user pasted into the base URL n8n's REST API lives on.
 *
 * Users naturally copy the address bar out of their n8n tab, which yields
 * something like `https://n8n.example.com/workflow/AbC123?projectId=PR-1`.
 * Callers append `/api/v1/...` to this value, so without normalisation the
 * request goes to `…/workflow/AbC123?projectId=PR-1/api/v1/workflows` — n8n
 * answers 404 with an HTML body and the user is told only "n8n returned 404",
 * which reads like a bad API key rather than a bad URL.
 *
 * Query string and hash are always dropped (never part of a base URL). A
 * genuine base path is PRESERVED — self-hosted n8n can live under a subpath
 * via `N8N_PATH` (e.g. `https://example.com/n8n`), so we only strip the path
 * from the first recognised UI route segment onward rather than reducing to
 * `origin`.
 *
 * Returns the input trimmed and unchanged if it cannot be parsed, so the
 * existing validation still produces the error message.
 */
export function normalizeN8nBaseUrl(raw: string): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return ''

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return trimmed
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return trimmed

  const segments = parsed.pathname.split('/').filter(Boolean)
  const cut = segments.findIndex((s) => N8N_UI_ROUTES.includes(s.toLowerCase()))
  const kept = cut === -1 ? segments : segments.slice(0, cut)
  const basePath = kept.length ? `/${kept.join('/')}` : ''

  // origin already excludes query/hash; basePath excludes UI routes.
  return `${parsed.origin}${basePath}`
}

// ── localStorage helpers ──────────────────────────────────────────────────────

/**
 * Save credentials. Persists to localStorage immediately (always — this is
 * the fallback the rest of the app reads from). If storagePreference is
 * 'database', also awaits a save to the real /api/user/credentials endpoint
 * and REJECTS on failure — callers must surface this to the user instead of
 * silently pretending the database save succeeded (it used to 404 against a
 * stub with no user-visible signal at all).
 */
export async function saveCredentials(creds: N8nCredentials): Promise<void> {
  const persisted: PersistedCredentials = {
    instanceUrl: creds.instanceUrl,
    apiKey: creds.apiKey,
    storageType: creds.storagePreference,
    updatedAt: new Date().toISOString(),
  }

  localStorage.setItem(CRED_KEY, JSON.stringify(persisted))

  if (creds.storagePreference === 'database') {
    await saveToDatabase(persisted)
  }
}

/**
 * Load credentials from localStorage.
 * Returns null if no credentials are stored or if the stored data is invalid.
 */
export function loadCredentials(): StoredCredentials | null {
  const raw = localStorage.getItem(CRED_KEY)
  if (!raw) return null

  try {
    const parsed: PersistedCredentials = JSON.parse(raw)
    if (!parsed.instanceUrl || !parsed.apiKey) return null
    return {
      instanceUrl: parsed.instanceUrl,
      apiKey: parsed.apiKey,
      storageType: parsed.storageType,
    }
  } catch {
    return null
  }
}

/**
 * Remove stored credentials from localStorage.
 */
export function clearCredentials(): void {
  localStorage.removeItem(CRED_KEY)
}

// ── Database storage ──────────────────────────────────────────────────────────

/** Persists credentials server-side, encrypted at rest (see app/api/user/credentials/route.ts). */
async function saveToDatabase(creds: PersistedCredentials): Promise<void> {
  const res = await fetch(asset('/api/user/credentials'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      n8n_instance_url: creds.instanceUrl,
      n8n_api_key: creds.apiKey,
      storage_type: creds.storageType,
    }),
  })

  if (!res.ok) {
    throw new Error(`Database credential save failed: ${res.status}`)
  }
}
