/**
 * Passkeys for the signed-in account.
 *
 * Backend: avry-backend /api/v1/auth/passkey (JWT). Signing in with a passkey
 * happens on the landing login; here the user adds, lists and removes them.
 */

import { authedFetch } from './deployAuth'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

export interface Passkey {
  id: number
  name: string
  created_at: string | null
  last_used_at: string | null
}

/** The user closed the passkey prompt; nothing to report. */
export class PasskeyCancelledError extends Error {
  constructor() {
    super('passkey_cancelled')
  }
}

/**
 * Marks this browser as having made a passkey, so the login page stops showing
 * its "no passkey yet?" hint. Same origin as the landing, where login lives.
 * Not "aivory_"-prefixed: logout clears those, and this must outlive it.
 */
const PASSKEY_HINT_KEY = 'passkey_hint'

export function markPasskeyAdded(): void {
  try {
    localStorage.setItem(PASSKEY_HINT_KEY, '1')
  } catch {
    // storage disabled: the login hint just stays visible
  }
}

export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined'
}

async function failWith(res: Response): Promise<never> {
  const detail = await res.json().then((d) => d?.detail).catch(() => null)
  throw new Error(typeof detail === 'string' ? detail : `Request failed (${res.status})`)
}

export async function listPasskeys(): Promise<Passkey[]> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/auth/passkey`)
  if (!res.ok) return failWith(res)
  return (await res.json()).passkeys as Passkey[]
}

export async function addPasskey(name: string): Promise<void> {
  const { startRegistration } = await import('@simplewebauthn/browser')

  const optRes = await authedFetch(`${BACKEND_URL}/api/v1/auth/passkey/register/options`, { method: 'POST' })
  if (!optRes.ok) return failWith(optRes)
  const { options, challenge_token } = await optRes.json()

  let credential
  try {
    credential = await startRegistration({ optionsJSON: options })
  } catch (err) {
    if (err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
      throw new PasskeyCancelledError()
    }
    // InvalidStateError: this device already holds a passkey for the account.
    if (err instanceof Error && err.name === 'InvalidStateError') {
      throw new Error('This device already has a passkey for your account')
    }
    throw new Error('Could not create a passkey on this device')
  }

  const res = await authedFetch(`${BACKEND_URL}/api/v1/auth/passkey/register/verify`, {
    method: 'POST',
    body: JSON.stringify({ challenge_token, credential, name }),
  })
  if (!res.ok) return failWith(res)
  markPasskeyAdded()
}

export async function removePasskey(id: number): Promise<void> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/auth/passkey/${id}`, { method: 'DELETE' })
  if (!res.ok) return failWith(res)
}
