/**
 * Optional company website for the Deep Diagnostic (ADR-022).
 * Client-side shape check only; the bridge re-validates and blocks private
 * addresses, so this just catches typos early.
 */

/** Returns a normalised https URL string, or null when the input isn't a plausible public website. */
export function normalizeWebsiteInput(input: string): string | null {
  const raw = (input ?? '').trim()
  if (!raw || raw.length > 300 || /\s/.test(raw)) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
  let u: URL
  try {
    u = new URL(withScheme)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (u.username || u.password) return null
  if (!u.hostname.includes('.') || u.hostname.endsWith('.')) return null
  u.hash = ''
  return u.toString()
}
