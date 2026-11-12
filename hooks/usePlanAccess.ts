'use client'

import { useSyncExternalStore } from 'react'
import { getPlanAccess, subscribePlanAccess, type PlanAccess } from '@/lib/planAccess'

const SERVER_SNAPSHOT: PlanAccess = { status: 'loading', paid: null, tier: null }

/**
 * The account's plan for drawing locks and upgrade prompts. `paid` is null
 * while unknown or unreadable: callers must not lock anything on null (the
 * server still refuses what isn't paid for).
 */
export function usePlanAccess(): PlanAccess {
  return useSyncExternalStore(subscribePlanAccess, getPlanAccess, () => SERVER_SNAPSHOT)
}

/** True only when the plan is known and it is not paid. */
export function useIsFreeAccount(): boolean {
  return usePlanAccess().paid === false
}
