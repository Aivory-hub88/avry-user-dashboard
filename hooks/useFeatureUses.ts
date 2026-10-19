'use client'

import { useEffect, useState } from 'react'
import { authedFetch } from '@/lib/deployAuth'

/** Runs left on what the customer bought (avry-backend /entitlements/uses). */
export interface FeatureUse {
  remaining: number
  granted: number
  used: number
  unlimited: boolean
}

export type FeatureUses = { snapshot: FeatureUse; blueprint: FeatureUse }

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

/** null while loading or when the lookup fails — callers fall back to the old flags. */
export function useFeatureUses(): FeatureUses | null {
  const [uses, setUses] = useState<FeatureUses | null>(null)
  useEffect(() => {
    let cancelled = false
    authedFetch(`${BACKEND}/api/v1/entitlements/uses`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.uses?.snapshot && data?.uses?.blueprint) setUses(data.uses)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return uses
}

/** "2 of 3 runs left", "Unlimited runs". */
export function runsLabel(use: FeatureUse): string {
  if (use.unlimited) return 'Unlimited runs'
  return `${use.remaining} of ${use.granted} run${use.granted === 1 ? '' : 's'} left`
}
