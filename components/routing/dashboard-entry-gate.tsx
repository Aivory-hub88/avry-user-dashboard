'use client'

/**
 * DashboardEntryGate — operational-dashboard access gate (nextjs-console)
 *
 * Wraps the dashboard route group and renders its children only once the
 * {@link useDashboardAccess} state machine resolves to `allowed`. The hook owns
 * the access decision and ALREADY issues the (single) redirect on denial, so the
 * gate is purely a presentational guard around the resolved status:
 *
 *   - `loading` → full-screen loading state while access resolves after
 *      hydration (Req 3.6 monotonic transition; design `resolveDashboardAccess`).
 *   - `denied`  → render `null`. The hook has already started the redirect, so we
 *      expose NO dashboard content or user data to a user being routed away
 *      (Req 13.4, 13.5, 13.6).
 *   - `allowed` → render the protected `children`.
 *
 * Because nothing but a neutral spinner is rendered until the status is
 * explicitly `allowed`, an unauthenticated or free-tier visitor never sees any
 * Product_Dashboard markup or user data — denial is fail-closed by construction.
 *
 * Requirements: 3.6, 13.4, 13.5, 13.6
 */

import type { ReactNode } from 'react'
import LoadingState from '@/components/dashboard/LoadingState'
import { useDashboardAccess } from '@/hooks/useDashboardAccess'

export interface DashboardEntryGateProps {
  /** Protected dashboard content, rendered only when access resolves to `allowed`. */
  children: ReactNode
}

/**
 * Client gate for the dashboard route group. Shows a loading state until access
 * resolves, renders `null` on denial (the hook has issued the redirect), and
 * renders `children` only when access is `allowed`.
 */
export function DashboardEntryGate({ children }: DashboardEntryGateProps) {
  const { status } = useDashboardAccess()

  // Access granted — reveal the protected dashboard content.
  if (status === 'allowed') {
    return <>{children}</>
  }

  // Denied — the hook has already started the single redirect. Render nothing so
  // no dashboard content or user data is exposed while we navigate away
  // (Req 13.4, 13.5, 13.6).
  if (status === 'denied') {
    return null
  }

  // `loading` (SSR + pre-resolution): neutral full-screen loading state, no
  // dashboard content or user data (Req 3.6).
  return <LoadingState />
}

export default DashboardEntryGate
