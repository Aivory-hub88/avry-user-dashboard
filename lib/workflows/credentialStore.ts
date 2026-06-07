/**
 * Credential Store — persists and retrieves n8n credentials.
 *
 * Supports two storage backends:
 *   - localStorage (browser-only, immediate)
 *   - database (calls PATCH /api/user/credentials — stub for future)
 *
 * This module runs client-side only.
 */

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
 * Save credentials. Persists to localStorage immediately.
 * If storagePreference is 'database', also calls the database stub endpoint.
 */
export function saveCredentials(creds: N8nCredentials): void {
  const persisted: PersistedCredentials = {
    instanceUrl: creds.instanceUrl,
    apiKey: creds.apiKey,
    storageType: creds.storagePreference,
    updatedAt: new Date().toISOString(),
  }

  localStorage.setItem(CRED_KEY, JSON.stringify(persisted))

  // If user chose database storage, also persist server-side (stub)
  if (creds.storagePreference === 'database') {
    saveToDatabaseStub(persisted).catch((err) => {
      console.warn('[credentialStore] Database save failed (stub):', err)
    })
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

// ── Database storage stub ─────────────────────────────────────────────────────

/**
 * Placeholder for future database persistence.
 * Calls PATCH /api/user/credentials — endpoint does not exist yet.
 */
async function saveToDatabaseStub(creds: PersistedCredentials): Promise<void> {
  const res = await fetch('/api/user/credentials', {
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
