/**
 * Lightweight Supabase storage for free diagnostic lead capture.
 *
 * Design:
 * - Fire-and-forget: never blocks the user flow
 * - Silent failure: console.warn only, never throws
 * - Minimal data: just the lead metadata for sales follow-up
 */

import { supabase } from './client'

export interface FreeDiagnosticLead {
  diagnostic_id: string
  company_name: string
  company_size: string
  industry: string
  score: number
  maturity_level: string
}

/**
 * Saves a free diagnostic lead to Supabase.
 * Fire-and-forget — does not throw, does not block.
 * If Supabase is down or misconfigured, logs a warning and moves on.
 */
export function saveDiagnosticLead(data: FreeDiagnosticLead): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Skip silently if Supabase is not configured
  if (!url || !key) {
    console.warn('[FreeDiagnosticStorage] Supabase not configured, skipping lead save')
    return
  }

  // Fire-and-forget insert — intentionally not awaited
  void (async () => {
    try {
      const { error } = await supabase
        .from('free_diagnostics')
        .insert({
          diagnostic_id: data.diagnostic_id,
          company_name: data.company_name,
          company_size: data.company_size,
          industry: data.industry,
          score: data.score,
          maturity_level: data.maturity_level,
        })

      if (error) {
        console.warn('[FreeDiagnosticStorage] Failed to save lead:', error.message)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[FreeDiagnosticStorage] Unexpected error:', message)
    }
  })()
}
