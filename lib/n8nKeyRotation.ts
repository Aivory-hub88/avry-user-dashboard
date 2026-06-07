/**
 * n8n API Key Rotation — round-robin across N8N_API_KEY_1, _2, _3
 *
 * Falls back to legacy N8N_API_KEY if rotation keys are not set.
 */

let _keys: string[] | null = null
let _index = 0

function loadKeys(): string[] {
  if (_keys) return _keys

  const k1 = process.env.N8N_API_KEY_1
  const k2 = process.env.N8N_API_KEY_2
  const k3 = process.env.N8N_API_KEY_3

  const rotationKeys = [k1, k2, k3].filter(Boolean) as string[]

  if (rotationKeys.length > 0) {
    _keys = rotationKeys
  } else {
    const legacy = process.env.N8N_API_KEY
    _keys = legacy ? [legacy] : []
  }

  return _keys
}

/** Get the next API key in round-robin order. */
export function getNextN8nApiKey(): string | null {
  const keys = loadKeys()
  if (keys.length === 0) return null
  const key = keys[_index % keys.length]
  _index = (_index + 1) % keys.length
  return key
}
