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
