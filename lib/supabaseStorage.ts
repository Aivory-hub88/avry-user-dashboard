/**
 * Supabase Storage Service for Aivory Next.js console.
 *
 * Provides typed save/load functions for:
 *   - DeepDiagnosticResult  → table: diagnostic_results,  key: diagnostic_id
 *   - BlueprintV1           → table: blueprints,          key: blueprint_id
 *   - AiryRoadmap           → table: roadmaps,            key: roadmap_id
 *   - DiagnosticContext     → table: diagnostic_contexts, key: organization_id
 *
 * Design rules:
 * - All functions call assertConfigured() first (Req 1.4)
 * - Dual-write: Supabase upsert + localStorage (Req 3.1, 4.1, 5.1, 6.1)
 * - Supabase failure + localStorage success → log, return outcome, no throw (Req 3.2, 4.2, 5.2, 6.3)
 * - Both fail → throw with data type + both failure reasons (Req 7.6)
 * - localStorage SecurityError → catch, rely solely on Supabase (Req 7.3)
 * - All localStorage access guarded with typeof window !== 'undefined' (Req 3.7)
 * - Supabase errors logged as: [StorageService] <op>: <message|'no message'> (Req 7.5)
 * - Uninitialized client → return null for loads, log warning once per process (Req 1.6)
 * - organization_id defaults to 'demo_org' in non-production (Req 8.3)
 * - Blueprint load enforces 10-second timeout before falling back (Req 4.5)
 * - Promise.allSettled used for concurrent ops — no unhandled rejections (Req 7.4)
 */

import { supabase, assertConfigured, isMisconfigured } from '@/lib/supabaseClient'
import type { DeepDiagnosticResult } from '@/types/deepDiagnostic'
import type { BlueprintV1 } from '@/types/blueprint'
import type { AiryRoadmap } from '@/types/roadmap'
import type { DiagnosticContext } from '@/types/diagnostic'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SaveOutcome = { local: boolean; remote: boolean }

// ── Module-level state ────────────────────────────────────────────────────────

/** Ensures the "client not initialized" warning is logged at most once (Req 1.6) */
let _initWarningLogged = false

// ── localStorage keys ─────────────────────────────────────────────────────────

const LS_KEYS = {
  deepResult:        'aivory_deep_result',
  blueprint:         'aivory_blueprint',
  roadmap:           'aivory_roadmap',
  diagnosticContext: 'aivory_diagnostic_context',
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true when running in a browser context. */
function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

/** Resolves the effective organization_id, applying the 'demo_org' default in non-production. */
function resolveOrgId(organization_id: string): string {
  if (organization_id && organization_id.trim() !== '') return organization_id.trim()
  if (process.env.NODE_ENV !== 'production') return 'demo_org'
  throw new Error('[StorageService] organization_id is required in production environments')
}

/** Logs a Supabase error with the standard prefix. Falls back to 'no message' (Req 7.5). */
function logSupabaseError(operation: string, error: unknown): void {
  const msg = (error instanceof Error ? error.message : null)
    ?? (typeof error === 'object' && error !== null && 'message' in error
        ? String((error as Record<string, unknown>).message)
        : null)
    ?? 'no message'
  console.error(`[StorageService] ${operation}:`, msg)
}

/**
 * Attempts to write a value to localStorage.
 * Returns true on success, false on failure (including SecurityError).
 * Never throws (Req 7.3).
 */
function lsWrite(key: string, value: unknown): boolean {
  if (!isBrowser()) return false
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/**
 * Attempts to read a value from localStorage.
 * Returns null on any failure (including SecurityError).
 * Never throws (Req 7.3).
 */
function lsRead<T>(key: string): T | null {
  if (!isBrowser()) return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * Wraps a thenable with a timeout.
 * Rejects with a timeout error after `ms` milliseconds.
 */
function withTimeout<T>(thenable: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`[StorageService] ${label} timed out after ${ms}ms`)),
      ms
    )
    Promise.resolve(thenable).then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) }
    )
  })
}

/**
 * Checks whether the Supabase client is usable.
 * Logs the "not initialized" warning at most once per process lifetime.
 */
function checkClientReady(): boolean {
  if (isMisconfigured) {
    if (!_initWarningLogged) {
      console.warn(
        '[StorageService] Supabase client is not configured. ' +
        'All load operations will return null and saves will be localStorage-only. ' +
        'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable cloud sync.'
      )
      _initWarningLogged = true
    }
    return false
  }
  return true
}

// ── Deep Diagnostic Result ────────────────────────────────────────────────────

/**
 * Saves a DeepDiagnosticResult to Supabase (upsert on diagnostic_id) and localStorage.
 * Req 3.1 – 3.3
 */
export async function saveDeepDiagnosticResult(
  data: DeepDiagnosticResult,
  organization_id: string
): Promise<SaveOutcome> {
  assertConfigured()
  const orgId = resolveOrgId(organization_id)

  let remoteOk = false
  let localOk  = false
  let remoteErr: string | null = null
  let localErr:  string | null = null

  // Supabase upsert (fire-and-forget style — caller gets control back via Promise.allSettled)
  const [remoteResult, localResult] = await Promise.allSettled([
    supabase
      .from('diagnostic_results')
      .upsert(
        { organization_id: orgId, diagnostic_id: data.diagnostic_id, result_data: data },
        { onConflict: 'diagnostic_id' }
      ),
    Promise.resolve(lsWrite(LS_KEYS.deepResult, data)),
  ])

  if (remoteResult.status === 'fulfilled') {
    const { error } = remoteResult.value
    if (error) {
      logSupabaseError('saveDeepDiagnosticResult upsert', error)
      remoteErr = error.message ?? 'no message'
    } else {
      remoteOk = true
    }
  } else {
    logSupabaseError('saveDeepDiagnosticResult upsert', remoteResult.reason)
    remoteErr = String(remoteResult.reason)
  }

  if (localResult.status === 'fulfilled') {
    localOk = localResult.value
    if (!localOk) localErr = 'localStorage write failed (SecurityError or unavailable)'
  } else {
    localErr = String(localResult.reason)
  }

  // Both failed → throw (Req 3.3 / 7.6)
  if (!remoteOk && !localOk) {
    throw new Error(
      `[StorageService] saveDeepDiagnosticResult: both writes failed. ` +
      `Supabase: ${remoteErr}. localStorage: ${localErr}.`
    )
  }

  return { local: localOk, remote: remoteOk }
}

/**
 * Loads the most recent DeepDiagnosticResult for an organization.
 * Tries Supabase first; falls back to localStorage (Req 3.4 – 3.6).
 */
export async function loadDeepDiagnosticResult(
  organization_id: string
): Promise<DeepDiagnosticResult | null> {
  assertConfigured()
  const orgId = resolveOrgId(organization_id)

  if (!checkClientReady()) {
    return lsRead<DeepDiagnosticResult>(LS_KEYS.deepResult)
  }

  try {
    const { data, error } = await supabase
      .from('diagnostic_results')
      .select('result_data')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) {
      if (error && error.code !== 'PGRST116') {
        // PGRST116 = "no rows returned" — not a real error
        logSupabaseError('loadDeepDiagnosticResult fetch', error)
      }
      return lsRead<DeepDiagnosticResult>(LS_KEYS.deepResult)
    }

    const result = data.result_data as DeepDiagnosticResult
    // Update localStorage cache (best-effort, abandon on failure — Req 3.5)
    lsWrite(LS_KEYS.deepResult, result)
    return result
  } catch (err) {
    logSupabaseError('loadDeepDiagnosticResult', err)
    return lsRead<DeepDiagnosticResult>(LS_KEYS.deepResult)
  }
}

// ── Blueprint ─────────────────────────────────────────────────────────────────

/**
 * Saves a BlueprintV1 to Supabase (upsert on blueprint_id) and localStorage.
 * Req 4.1 – 4.4
 */
export async function saveBlueprint(
  data: BlueprintV1,
  organization_id: string
): Promise<SaveOutcome> {
  assertConfigured()
  const orgId = resolveOrgId(organization_id)

  let remoteOk = false
  let localOk  = false
  let remoteErr: string | null = null
  let localErr:  string | null = null

  const [remoteResult, localResult] = await Promise.allSettled([
    supabase
      .from('blueprints')
      .upsert(
        { organization_id: orgId, blueprint_id: data.blueprint_id, blueprint_data: data },
        { onConflict: 'blueprint_id' }
      ),
    Promise.resolve(lsWrite(LS_KEYS.blueprint, data)),
  ])

  if (remoteResult.status === 'fulfilled') {
    const { error } = remoteResult.value
    if (error) {
      logSupabaseError('saveBlueprint upsert', error)
      remoteErr = error.message ?? 'no message'
    } else {
      remoteOk = true
    }
  } else {
    logSupabaseError('saveBlueprint upsert', remoteResult.reason)
    remoteErr = String(remoteResult.reason)
  }

  if (localResult.status === 'fulfilled') {
    localOk = localResult.value
    if (!localOk) localErr = 'localStorage write failed (SecurityError or unavailable)'
  } else {
    localErr = String(localResult.reason)
  }

  // Both failed → throw (Req 4.4 / 7.6)
  if (!remoteOk && !localOk) {
    throw new Error(
      `[StorageService] saveBlueprint: both writes failed. ` +
      `Supabase: ${remoteErr}. localStorage: ${localErr}.`
    )
  }

  return { local: localOk, remote: remoteOk }
}

/**
 * Loads a BlueprintV1 for an organization.
 * Enforces a 10-second timeout on the Supabase fetch before falling back (Req 4.5).
 */
export async function loadBlueprint(
  organization_id: string
): Promise<BlueprintV1 | null> {
  assertConfigured()
  const orgId = resolveOrgId(organization_id)

  if (!checkClientReady()) {
    return lsRead<BlueprintV1>(LS_KEYS.blueprint)
  }

  try {
    const fetchPromise = supabase
      .from('blueprints')
      .select('blueprint_data')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const { data, error } = await withTimeout(fetchPromise, 10_000, 'loadBlueprint')

    if (error || !data) {
      if (error && error.code !== 'PGRST116') {
        logSupabaseError('loadBlueprint fetch', error)
      }
      return lsRead<BlueprintV1>(LS_KEYS.blueprint)
    }

    const result = data.blueprint_data as BlueprintV1
    // Update localStorage cache (abandon on failure — Req 4.6)
    lsWrite(LS_KEYS.blueprint, result)
    return result
  } catch (err) {
    logSupabaseError('loadBlueprint', err)
    return lsRead<BlueprintV1>(LS_KEYS.blueprint)
  }
}

// ── Roadmap ───────────────────────────────────────────────────────────────────

/**
 * Saves an AiryRoadmap to Supabase (upsert on roadmap_id) and localStorage.
 * Req 5.1 – 5.3
 */
export async function saveRoadmapToSupabase(
  data: AiryRoadmap,
  organization_id: string
): Promise<SaveOutcome> {
  assertConfigured()
  const orgId = resolveOrgId(organization_id)

  let remoteOk = false
  let localOk  = false
  let remoteErr: string | null = null
  let localErr:  string | null = null

  const [remoteResult, localResult] = await Promise.allSettled([
    supabase
      .from('roadmaps')
      .upsert(
        { organization_id: orgId, roadmap_id: data.id, roadmap_data: data },
        { onConflict: 'roadmap_id' }
      ),
    Promise.resolve(lsWrite(LS_KEYS.roadmap, data)),
  ])

  if (remoteResult.status === 'fulfilled') {
    const { error } = remoteResult.value
    if (error) {
      logSupabaseError('saveRoadmap upsert', error)
      remoteErr = error.message ?? 'no message'
    } else {
      remoteOk = true
    }
  } else {
    logSupabaseError('saveRoadmap upsert', remoteResult.reason)
    remoteErr = String(remoteResult.reason)
  }

  if (localResult.status === 'fulfilled') {
    localOk = localResult.value
    if (!localOk) localErr = 'localStorage write failed (SecurityError or unavailable)'
  } else {
    localErr = String(localResult.reason)
  }

  // Both failed → throw (Req 5.3 / 7.6)
  if (!remoteOk && !localOk) {
    throw new Error(
      `[StorageService] saveRoadmap: both writes failed. ` +
      `Supabase: ${remoteErr}. localStorage: ${localErr}.`
    )
  }

  return { local: localOk, remote: remoteOk }
}

/**
 * Loads an AiryRoadmap for an organization.
 * Tries Supabase first; falls back to localStorage (Req 5.4 – 5.6).
 */
export async function loadRoadmapFromSupabase(
  organization_id: string
): Promise<AiryRoadmap | null> {
  assertConfigured()
  const orgId = resolveOrgId(organization_id)

  if (!checkClientReady()) {
    return lsRead<AiryRoadmap>(LS_KEYS.roadmap)
  }

  try {
    const { data, error } = await supabase
      .from('roadmaps')
      .select('roadmap_data')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) {
      if (error && error.code !== 'PGRST116') {
        logSupabaseError('loadRoadmap fetch', error)
      }
      return lsRead<AiryRoadmap>(LS_KEYS.roadmap)
    }

    const result = data.roadmap_data as AiryRoadmap
    // Update localStorage cache (abandon on failure — Req 5.5)
    lsWrite(LS_KEYS.roadmap, result)
    return result
  } catch (err) {
    logSupabaseError('loadRoadmap', err)
    return lsRead<AiryRoadmap>(LS_KEYS.roadmap)
  }
}

// ── Diagnostic Context ────────────────────────────────────────────────────────

/**
 * Saves a DiagnosticContext to Supabase (upsert on organization_id) and localStorage.
 * One context per organization — overwrites the previous (Req 6.1 – 6.4).
 */
export async function saveDiagnosticContext(
  data: DiagnosticContext,
  organization_id: string
): Promise<SaveOutcome> {
  assertConfigured()
  const orgId = resolveOrgId(organization_id)

  let remoteOk = false
  let localOk  = false
  let remoteErr: string | null = null
  let localErr:  string | null = null

  const [remoteResult, localResult] = await Promise.allSettled([
    supabase
      .from('diagnostic_contexts')
      .upsert(
        { organization_id: orgId, context_data: data },
        { onConflict: 'organization_id' }
      ),
    Promise.resolve(lsWrite(LS_KEYS.diagnosticContext, data)),
  ])

  if (remoteResult.status === 'fulfilled') {
    const { error } = remoteResult.value
    if (error) {
      logSupabaseError('saveDiagnosticContext upsert', error)
      remoteErr = error.message ?? 'no message'
    } else {
      remoteOk = true
    }
  } else {
    logSupabaseError('saveDiagnosticContext upsert', remoteResult.reason)
    remoteErr = String(remoteResult.reason)
  }

  if (localResult.status === 'fulfilled') {
    localOk = localResult.value
    if (!localOk) localErr = 'localStorage write failed (SecurityError or unavailable)'
  } else {
    localErr = String(localResult.reason)
  }

  // Both failed → throw (Req 6.4 / 7.6)
  if (!remoteOk && !localOk) {
    throw new Error(
      `[StorageService] saveDiagnosticContext: both writes failed. ` +
      `Supabase: ${remoteErr}. localStorage: ${localErr}.`
    )
  }

  return { local: localOk, remote: remoteOk }
}

/**
 * Loads a DiagnosticContext for an organization.
 * Tries Supabase first; falls back to localStorage (Req 6.5 – 6.8).
 */
export async function loadDiagnosticContext(
  organization_id: string
): Promise<DiagnosticContext | null> {
  assertConfigured()
  const orgId = resolveOrgId(organization_id)

  if (!checkClientReady()) {
    return lsRead<DiagnosticContext>(LS_KEYS.diagnosticContext)
  }

  try {
    const { data, error } = await supabase
      .from('diagnostic_contexts')
      .select('context_data')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) {
      if (error && error.code !== 'PGRST116') {
        logSupabaseError('loadDiagnosticContext fetch', error)
      }
      return lsRead<DiagnosticContext>(LS_KEYS.diagnosticContext)
    }

    const result = data.context_data as DiagnosticContext
    // Update localStorage cache (abandon on failure — Req 6.6)
    lsWrite(LS_KEYS.diagnosticContext, result)
    return result
  } catch (err) {
    logSupabaseError('loadDiagnosticContext', err)
    return lsRead<DiagnosticContext>(LS_KEYS.diagnosticContext)
  }
}
