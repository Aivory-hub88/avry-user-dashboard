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

async function parseErrorAndThrow(res: Response): Promise<never> {
  const detail = await res.json().then((d) => d?.detail).catch(() => null)
  throw new Error(typeof detail === 'string' ? detail : `Request failed (${res.status})`)
}

export async function listByokKeys(): Promise<ByokKey[]> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/byok-keys`)
  if (!res.ok) return parseErrorAndThrow(res)
  return (await res.json()).keys as ByokKey[]
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
