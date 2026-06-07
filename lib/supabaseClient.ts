/**
 * Supabase singleton client for the Aivory Next.js console.
 *
 * Rules (Req 1.1 – 1.3):
 * - Reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY at module load.
 * - If either is missing/empty, isMisconfigured = true and the module still loads
 *   without throwing (so importing modules don't crash on import).
 * - assertConfigured() throws a descriptive ConfigurationError whenever called
 *   while isMisconfigured === true — even if placeholder values would work.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ── Configuration check ───────────────────────────────────────────────────────

const _url  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const _key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

const _missingVars: string[] = []
if (!_url)  _missingVars.push('NEXT_PUBLIC_SUPABASE_URL')
if (!_key)  _missingVars.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')

/** True when one or both required env vars are absent or empty. */
export const isMisconfigured: boolean = _missingVars.length > 0

/**
 * Throws a ConfigurationError identifying which env var(s) are missing.
 * Always throws when isMisconfigured === true, regardless of whether
 * placeholder values would otherwise allow an operation to succeed.
 */
export function assertConfigured(): void {
  if (isMisconfigured) {
    throw new Error(
      `[SupabaseClient] ConfigurationError: missing required environment variable(s): ${_missingVars.join(', ')}. ` +
      `Set these in your .env.local file before using Supabase storage.`
    )
  }
}

// ── Singleton client ──────────────────────────────────────────────────────────
// createClient is called with real values when configured, or placeholder
// strings when misconfigured so the module loads without throwing.

export const supabase: SupabaseClient = createClient(
  _url  || 'https://placeholder.supabase.co',
  _key  || 'placeholder-anon-key'
)
