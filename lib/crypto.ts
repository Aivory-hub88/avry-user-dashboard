/**
 * Symmetric encryption for secrets we persist server-side (n8n API keys —
 * see lib/workflows/n8nCredentialsServer.ts).
 *
 * AES-256-GCM via Node's built-in `crypto`, storage format `nonce (12B) +
 * ciphertext + authTag (16B)` in one buffer — mirrors the convention already
 * used by services/avry-careers' encryption_service.py (a different service,
 * different language, but the same reviewed approach).
 *
 * Deliberately its OWN env var (N8N_CREDENTIALS_ENCRYPTION_KEY), not shared
 * with avry-careers' ENCRYPTION_KEY, so key rotation stays decoupled between
 * unrelated services. No fallback key: missing/malformed env throws at first
 * use, matching lib/db.ts's and lib/serverAuth.ts's "fail loud" convention.
 *
 * Node runtime only (uses `node:crypto`) — routes importing this must
 * declare `export const runtime = 'nodejs'`.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const NONCE_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const hex = process.env.N8N_CREDENTIALS_ENCRYPTION_KEY
  if (!hex) {
    throw new Error('N8N_CREDENTIALS_ENCRYPTION_KEY env var is required — refusing to encrypt with a default key')
  }
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) {
    throw new Error('N8N_CREDENTIALS_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)')
  }
  return key
}

/** Encrypts a plaintext string into a single buffer: nonce + ciphertext + authTag. */
export function encryptSecret(plaintext: string): Buffer {
  const nonce = randomBytes(NONCE_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getKey(), nonce)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([nonce, ciphertext, authTag])
}

/** Inverse of encryptSecret() — throws if the buffer is malformed or the tag doesn't verify. */
export function decryptSecret(buf: Buffer): string {
  if (buf.length < NONCE_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Encrypted secret buffer is too short to be valid')
  }
  const nonce = buf.subarray(0, NONCE_LENGTH)
  const authTag = buf.subarray(buf.length - AUTH_TAG_LENGTH)
  const ciphertext = buf.subarray(NONCE_LENGTH, buf.length - AUTH_TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, getKey(), nonce)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
