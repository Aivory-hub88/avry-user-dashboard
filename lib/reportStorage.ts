/**
 * Postgres-backed report storage client (Phase 2,
 * docs/DEEP-DIAGNOSTIC-RESULT-PLANNING.md). Replaces lib/supabaseStorage.ts.
 *
 * Rows are keyed server-side by the signed-in user's JWT — this module never
 * sends an organisation id or user id; the token IS the key. Deep Diagnostic
 * is a signed-in-only service (decision D4), so an absent token simply means
 * localStorage-only operation.
 *
 * Contract (carried over from the Supabase layer):
 * - localStorage is the always-on write-through cache and offline fallback;
 *   storage failures must never block rendering.
 * - save*: writes localStorage + POSTs when signed in; throws only when BOTH
 *   writes fail.
 * - load*: GETs when signed in; a server value wins and refreshes the cache.
 *   An empty server row means the account has nothing yet — the local cache
 *   is NOT migrated up onto it (a device/browser can be reused across
 *   accounts, e.g. demo accounts handed between prospects, and pushing a
 *   stale local copy into a different account's own row would be a
 *   cross-account data leak). Signed-out or server failure → localStorage.
 */
import { getToken } from '@/lib/auth'
import { authedFetch } from '@/lib/deployAuth'
import { asset } from '@/lib/asset'
import type { DeepDiagnosticResult } from '@/types/deepDiagnostic'
import type { BlueprintV1 } from '@/types/blueprint'
import type { AiryRoadmap } from '@/types/roadmap'
import type { DiagnosticContext, DiagnosticHistoryEntry } from '@/types/diagnostic'

export type SaveOutcome = { local: boolean; remote: boolean }

type Entity = 'context' | 'diagnostic' | 'blueprint' | 'roadmap'

const LS_KEYS: Record<Entity, string> = {
  context: 'aivory_diagnostic_context',
  diagnostic: 'aivory_deep_result',
  blueprint: 'aivory_blueprint',
  roadmap: 'aivory_roadmap',
}

/** Low timeout so a backend outage degrades to localStorage instead of hanging pages. */
const FETCH_TIMEOUT_MS = 6000

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

function lsWrite(key: string, value: unknown): boolean {
  if (!isBrowser()) return false
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

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
 * authedFetch (not plain fetch) so a stale-but-refreshable access token gets
 * exchanged and retried instead of silently 401ing. Access tokens live only
 * 60 minutes; before this, any save/load past the first hour of a session
 * degraded to localStorage-only with no visible error — reports looked like
 * they "only persisted briefly" because everything after minute 60 never
 * actually reached Postgres.
 */
async function apiFetch(entity: Entity, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    // asset() prepends the /dashboard basePath — raw fetch() paths don't get
    // it automatically (recurring 404 class).
    return await authedFetch(asset(`/api/storage/${entity}`), { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** GET the signed-in user's stored payload. ok=false → signed out or server unreachable. */
async function remoteLoad<T>(entity: Entity): Promise<{ ok: boolean; value: T | null }> {
  // Fast, sync, no-network gate: skip entirely when there is no session at
  // all (incl. server-side render). authedFetch handles refreshing a
  // stale-but-present token itself.
  const token = isBrowser() ? getToken() : null
  if (!token) return { ok: false, value: null }
  try {
    const res = await apiFetch(entity, {})
    if (!res.ok) {
      if (res.status !== 401) console.warn(`[ReportStorage] load ${entity}: HTTP ${res.status}`)
      return { ok: false, value: null }
    }
    return { ok: true, value: (await res.json()) as T | null }
  } catch (err) {
    console.warn(`[ReportStorage] load ${entity} failed:`, err instanceof Error ? err.message : err)
    return { ok: false, value: null }
  }
}

async function remoteSave(entity: Entity, data: unknown): Promise<boolean> {
  const token = isBrowser() ? getToken() : null
  if (!token) return false
  try {
    const res = await apiFetch(entity, {
      method: 'POST',
      body: JSON.stringify({ data }),
    })
    if (!res.ok) console.warn(`[ReportStorage] save ${entity}: HTTP ${res.status}`)
    return res.ok
  } catch (err) {
    console.warn(`[ReportStorage] save ${entity} failed:`, err instanceof Error ? err.message : err)
    return false
  }
}

async function saveEntity(entity: Entity, data: unknown): Promise<SaveOutcome> {
  const local = lsWrite(LS_KEYS[entity], data)
  const remote = await remoteSave(entity, data)
  if (!local && !remote) {
    throw new Error(`[ReportStorage] save ${entity}: both localStorage and server writes failed`)
  }
  return { local, remote }
}

async function loadEntity<T>(entity: Entity): Promise<T | null> {
  const { ok, value } = await remoteLoad<T>(entity)
  if (ok && value != null) {
    lsWrite(LS_KEYS[entity], value)
    return value
  }
  // Authed with an empty server row: this used to fall through to
  // localStorage and silently push it up to the account's own server row
  // ("migrate old local reports up"). That was fine for the one-time
  // Supabase-to-Postgres cutover it was written for, but on a shared device
  // (demo accounts handed between prospects) it means account B's dashboard
  // gets seeded with account A's leftover browser cache — a real
  // cross-account data leak, not just a display glitch. An authed, empty
  // server row now means "this account genuinely has nothing yet".
  if (ok) {
    lsWrite(LS_KEYS[entity], null)
    return null
  }
  // Signed out or the server was unreachable: localStorage is the only
  // source of truth available, same as before.
  return lsRead<T>(LS_KEYS[entity])
}

// ── Diagnostic context ────────────────────────────────────────────────────────
export const saveDiagnosticContext = (data: DiagnosticContext): Promise<SaveOutcome> =>
  saveEntity('context', data)
export const loadDiagnosticContext = (): Promise<DiagnosticContext | null> =>
  loadEntity<DiagnosticContext>('context')

// ── Deep Diagnostic result (LLM analysis) ─────────────────────────────────────
export const saveDeepDiagnosticResult = (data: DeepDiagnosticResult): Promise<SaveOutcome> =>
  saveEntity('diagnostic', data)
export const loadDeepDiagnosticResult = (): Promise<DeepDiagnosticResult | null> =>
  loadEntity<DeepDiagnosticResult>('diagnostic')

// ── Blueprint ─────────────────────────────────────────────────────────────────
export const saveBlueprint = (data: BlueprintV1): Promise<SaveOutcome> =>
  saveEntity('blueprint', data)
export const loadBlueprint = (): Promise<BlueprintV1 | null> =>
  loadEntity<BlueprintV1>('blueprint')

// ── Roadmap ───────────────────────────────────────────────────────────────────
// "Remote" suffix avoids clashing with the localStorage-only save/load pair in
// hooks/useRoadmap.ts at the call sites.
export const saveRoadmapRemote = (data: AiryRoadmap): Promise<SaveOutcome> =>
  saveEntity('roadmap', data)
export const loadRoadmapRemote = (): Promise<AiryRoadmap | null> =>
  loadEntity<AiryRoadmap>('roadmap')

// ── Assessment history (Phase E1.3) ────────────────────────────────────────────
// Genuinely server-only — there is no localStorage fallback and no save*
// counterpart here. History rows are written server-side as a side effect of
// saveDiagnosticContext's POST to /api/storage/context (see
// app/api/storage/[entity]/route.ts), never by the client directly. Signed
// out or a server error both degrade to an empty array so callers never need
// a try/catch of their own — "no history yet" and "can't reach history" look
// identical to the UI, which is the correct degrade per E2.3's ≥2-rows gate.
export async function loadDiagnosticHistory(): Promise<DiagnosticHistoryEntry[]> {
  const token = isBrowser() ? getToken() : null
  if (!token) return []
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await authedFetch(asset('/api/storage/history'), {
        signal: controller.signal,
      })
      if (!res.ok) {
        if (res.status !== 401) console.warn(`[ReportStorage] load history: HTTP ${res.status}`)
        return []
      }
      const value = (await res.json()) as DiagnosticHistoryEntry[]
      return Array.isArray(value) ? value : []
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    console.warn('[ReportStorage] load history failed:', err instanceof Error ? err.message : err)
    return []
  }
}
