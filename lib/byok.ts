/**
 * BYOK (bring your own key) — the user's own LLM provider keys.
 *
 * Backend: avry-backend /api/v1/byok-keys (JWT). The plaintext key goes up
 * once on save and is never returned: the backend stores it AES-256-GCM
 * encrypted and this module only ever sees provider, a masked hint and status.
 */

import { authedFetch } from './deployAuth'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

export type ByokProvider = 'openrouter' | 'anthropic' | 'openai'

export const BYOK_PROVIDERS: {
  id: ByokProvider
  label: string
  placeholder: string
  help: string
}[] = [
  { id: 'openrouter', label: 'OpenRouter', placeholder: 'sk-or-…', help: 'One key covers every model on OpenRouter.' },
  { id: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-…', help: 'Claude models, billed to your Anthropic account.' },
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-…', help: 'GPT models, billed to your OpenAI account.' },
]

export interface ByokKey {
  provider: ByokProvider
  key_hint: string
  status: 'active' | 'invalid'
  last_verified_at: string | null
  updated_at: string
}

/** The user's master switch and which provider chats should use first. */
export interface ByokSettings {
  enabled: boolean
  /** null = automatic (first connected provider). */
  preferred_provider: ByokProvider | null
}

export interface ByokOverview {
  keys: ByokKey[]
  settings: ByokSettings
}

async function parseErrorAndThrow(res: Response): Promise<never> {
  const detail = await res.json().then((d) => d?.detail).catch(() => null)
  throw new Error(typeof detail === 'string' ? detail : `Request failed (${res.status})`)
}

export async function listByokKeys(): Promise<ByokOverview> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/byok-keys`)
  if (!res.ok) return parseErrorAndThrow(res)
  const data = await res.json()
  return {
    keys: data.keys as ByokKey[],
    // An older backend has no settings: BYOK behaves as on, automatic.
    settings: (data.settings as ByokSettings | undefined) ?? { enabled: true, preferred_provider: null },
  }
}

export async function updateByokSettings(patch: Partial<ByokSettings>): Promise<ByokSettings> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/byok-keys/settings`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
  if (!res.ok) return parseErrorAndThrow(res)
  return res.json()
}

/**
 * The provider a chat would run on, mirroring the backend's resolution so the
 * UI can say so: nothing when switched off, else the primary provider if it
 * still has an active key, else the first connected one.
 */
export function effectiveProvider(keys: ByokKey[], settings: ByokSettings): ByokProvider | null {
  if (!settings.enabled) return null
  const active = new Set(keys.filter((k) => k.status === 'active').map((k) => k.provider))
  const order = [settings.preferred_provider, ...BYOK_PROVIDERS.map((p) => p.id)]
  return order.find((p): p is ByokProvider => !!p && active.has(p)) ?? null
}

export async function saveByokKey(provider: ByokProvider, apiKey: string): Promise<ByokKey> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/byok-keys/${provider}`, {
    method: 'PUT',
    body: JSON.stringify({ api_key: apiKey }),
  })
  if (!res.ok) return parseErrorAndThrow(res)
  return res.json()
}

export async function testByokKey(provider: ByokProvider): Promise<{ ok: boolean; reason: string | null }> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/byok-keys/${provider}/test`, { method: 'POST' })
  if (!res.ok) return parseErrorAndThrow(res)
  return res.json()
}

export async function deleteByokKey(provider: ByokProvider): Promise<void> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/byok-keys/${provider}`, { method: 'DELETE' })
  if (!res.ok) return parseErrorAndThrow(res)
}
