'use client'

/**
 * Browser side of the free analysis: talks to /api/diagnostics/free and keeps
 * a per-user cache (lib/userScopedStorage) so the result shows instantly and
 * survives a storage outage. The server is the source of truth for the result
 * and for the run count.
 */

import { asset } from '@/lib/asset'
import { authedFetch } from '@/lib/deployAuth'
import { scopedKey } from '@/lib/userScopedStorage'
import type { FreeAnalysisInput, StoredFreeAnalysis } from './scoring'

const RESULT_KEY = 'aivory_free_analysis_result'
const PROGRESS_KEY = 'aivory_free_analysis_progress'

export interface FreeAnalysisStatus {
  latest: StoredFreeAnalysis | null
  used: number
  limit: number
  remaining: number
}

export interface FreeAnalysisProgress {
  companyName: string
  industry: string
  companySize: string
  answers: Record<string, number>
}

function read<T>(base: string): T | null {
  try {
    const raw = localStorage.getItem(scopedKey(base))
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(base: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(scopedKey(base))
    else localStorage.setItem(scopedKey(base), JSON.stringify(value))
  } catch { /* storage unavailable */ }
}

export const cachedResult = () => read<StoredFreeAnalysis>(RESULT_KEY)
export const cacheResult = (r: StoredFreeAnalysis | null) => write(RESULT_KEY, r)
export const loadProgress = () => read<FreeAnalysisProgress>(PROGRESS_KEY)
export const saveProgress = (p: FreeAnalysisProgress | null) => write(PROGRESS_KEY, p)

/** Server status, or null when it could not be read (keep using the cache). */
export async function fetchFreeAnalysisStatus(): Promise<FreeAnalysisStatus | null> {
  try {
    const res = await authedFetch(asset('/api/diagnostics/free'), { cache: 'no-store' })
    if (!res.ok) return null
    const status = (await res.json()) as FreeAnalysisStatus
    if (status.latest) cacheResult(status.latest)
    return status
  } catch {
    return null
  }
}

export type SubmitOutcome =
  | { kind: 'saved'; result: StoredFreeAnalysis; status: FreeAnalysisStatus }
  | { kind: 'limit'; status: FreeAnalysisStatus }
  | { kind: 'error' }

export async function submitFreeAnalysis(input: FreeAnalysisInput): Promise<SubmitOutcome> {
  try {
    const res = await authedFetch(asset('/api/diagnostics/free'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const json = await res.json().catch(() => null)
    if (res.status === 429 && json) return { kind: 'limit', status: json as FreeAnalysisStatus }
    if (!res.ok || !json?.result) return { kind: 'error' }
    const { result, ...status } = json as { result: StoredFreeAnalysis } & FreeAnalysisStatus
    cacheResult(result)
    saveProgress(null)
    return { kind: 'saved', result, status }
  } catch {
    return { kind: 'error' }
  }
}
