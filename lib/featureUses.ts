/**
 * Server-side gate for the runs included with a purchase.
 *
 * Each one-time product includes 3 runs (avry-backend app/services/
 * feature_uses.py): the Analysis 3 diagnostics, the Blueprint + Roadmap 3
 * blueprints, the Complete package 3 of each. The generator routes used to
 * forward to the VPS bridge with no check at all; now a run may only start
 * with a run left, and is charged when its result is delivered — so a failed
 * job costs nothing, and re-polling a finished job never charges twice.
 *
 * Server-only: it forwards the caller's own access token to avry-backend, so a
 * customer can only ever spend their own runs.
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getAuthUserWithToken } from '@/lib/serverAuth'

export type Feature = 'snapshot' | 'blueprint' | 'copilot'

export interface FeatureUse {
  remaining: number
  granted: number
  used: number
  unlimited: boolean
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

const NOT_BOUGHT: Record<Feature, string> = {
  snapshot: 'Purchase the Business Operations Analysis to run a diagnostic.',
  blueprint: 'Purchase the Transformation Blueprint + Roadmap to generate a blueprint.',
  copilot: 'Workflow Copilot is part of the Operational plan. Upgrade to keep building.',
}

/**
 * Runs can come from a purchase (3 each) or, for an account that never bought
 * anything, from the one-time free allowance (2 diagnostics, 1 copilot
 * session; avry-backend FREE_GRANTS), so the text doesn't name a count.
 */
const USED_UP: Record<Feature, string> = {
  snapshot:
    'You have used all the analysis runs on your account. Upgrade to the Operational plan or buy the Analysis for 3 more.',
  blueprint:
    'You have used all the blueprint runs on your account. Buy the Blueprint + Roadmap again for 3 more.',
  copilot:
    'You have used your free Workflow Copilot session. Upgrade to the Operational plan to keep building.',
}

type Gate =
  | { ok: true; token: string; use: FeatureUse }
  | { ok: false; response: NextResponse }

/** Identify the caller and read their runs left for `feature`. */
async function lookup(request: NextRequest, feature: Feature): Promise<Gate> {
  let auth: ReturnType<typeof getAuthUserWithToken>
  try {
    auth = getAuthUserWithToken(request)
  } catch {
    auth = null
  }
  if (!auth) {
    return {
      ok: false,
      response: NextResponse.json({ message: 'Please sign in again to continue.', code: 'UNAUTHENTICATED' }, { status: 401 }),
    }
  }
  try {
    const res = await fetch(`${BACKEND}/api/v1/entitlements/uses`, {
      headers: { Authorization: `Bearer ${auth.token}` },
      cache: 'no-store',
    })
    if (res.status === 401) {
      return {
        ok: false,
        response: NextResponse.json({ message: 'Please sign in again to continue.', code: 'UNAUTHENTICATED' }, { status: 401 }),
      }
    }
    if (!res.ok) throw new Error(`uses lookup ${res.status}`)
    const data = await res.json()
    const use = data?.uses?.[feature] as FeatureUse | undefined
    if (!use) throw new Error('uses lookup returned no data')
    return { ok: true, token: auth.token, use }
  } catch (e) {
    console.error('[featureUses] lookup failed:', e)
    return {
      ok: false,
      response: NextResponse.json(
        { message: 'We could not check your purchase right now. Please try again in a moment.' },
        { status: 503 },
      ),
    }
  }
}

/** Gate for starting a run: the caller must have a run left. */
export async function requireRunLeft(request: NextRequest, feature: Feature): Promise<Gate> {
  const gate = await lookup(request, feature)
  if (!gate.ok) return gate
  const { use } = gate
  if (use.unlimited || use.remaining > 0) return gate
  return {
    ok: false,
    response: NextResponse.json(
      { message: use.granted > 0 ? USED_UP[feature] : NOT_BOUGHT[feature], code: 'NO_RUNS_LEFT', uses: use },
      { status: 402 },
    ),
  }
}

/**
 * Gate for something included with a feature that does not use up a run
 * (a roadmap for a blueprint): the caller must have bought the feature.
 */
export async function requireFeatureBought(request: NextRequest, feature: Feature): Promise<Gate> {
  const gate = await lookup(request, feature)
  if (!gate.ok) return gate
  if (gate.use.unlimited || gate.use.granted > 0) return gate
  return {
    ok: false,
    response: NextResponse.json({ message: NOT_BOUGHT[feature], code: 'NOT_PURCHASED' }, { status: 402 }),
  }
}

/**
 * Charge one run for a finished job, just before its result is handed over.
 * Returns null when the result may be delivered, or the response to send
 * instead (402 when the runs ran out, e.g. two runs started on the last one).
 */
export async function chargeRun(
  request: NextRequest,
  feature: Feature,
  jobRef: string,
  /** The route's own "still running, poll again" body. */
  pendingBody: Record<string, unknown>,
): Promise<NextResponse | null> {
  let auth: ReturnType<typeof getAuthUserWithToken>
  try {
    auth = getAuthUserWithToken(request)
  } catch {
    auth = null
  }
  if (!auth) {
    return NextResponse.json({ message: 'Please sign in again to continue.', code: 'UNAUTHENTICATED' }, { status: 401 })
  }
  try {
    const res = await fetch(`${BACKEND}/api/v1/entitlements/uses/consume`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature, ref: jobRef }),
      cache: 'no-store',
    })
    if (res.ok) return null
    if (res.status === 402) {
      return NextResponse.json({ message: USED_UP[feature], code: 'NO_RUNS_LEFT' }, { status: 402 })
    }
    if (res.status === 401) {
      return NextResponse.json({ message: 'Please sign in again to continue.', code: 'UNAUTHENTICATED' }, { status: 401 })
    }
    throw new Error(`consume ${res.status}`)
  } catch (e) {
    console.error('[featureUses] charge failed:', e)
    // Keep the finished job and let the client poll again: a "still running"
    // answer keeps it polling, and the charge is idempotent on the job id, so
    // the retry neither loses the result nor charges twice.
    return NextResponse.json(pendingBody)
  }
}


/**
 * Spend a free-allowance use up front, for features with no "delivered
 * result" to charge on (a copilot session). Idempotent on `ref`: the same
 * session keeps working, a new one needs a use left. Returns null when
 * allowed, otherwise the response to send (402 UPGRADE_REQUIRED, 401, 503).
 */
export async function chargeTrial(
  request: NextRequest,
  feature: Feature,
  ref: string,
): Promise<NextResponse | null> {
  let auth: ReturnType<typeof getAuthUserWithToken>
  try {
    auth = getAuthUserWithToken(request)
  } catch {
    auth = null
  }
  if (!auth) {
    return NextResponse.json({ message: 'Please sign in again to continue.', code: 'UNAUTHENTICATED' }, { status: 401 })
  }
  try {
    const res = await fetch(`${BACKEND}/api/v1/entitlements/uses/consume`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature, ref }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) return null
    if (res.status === 402) {
      return NextResponse.json(
        { message: USED_UP[feature], error: USED_UP[feature], code: 'UPGRADE_REQUIRED', requiredTier: 'operational', trialUsed: true },
        { status: 402 },
      )
    }
    if (res.status === 401) {
      return NextResponse.json({ message: 'Please sign in again to continue.', code: 'UNAUTHENTICATED' }, { status: 401 })
    }
    throw new Error(`consume ${res.status}`)
  } catch (e) {
    console.error('[featureUses] trial charge failed:', e)
    return NextResponse.json(
      { message: 'We could not check your plan right now. Please try again in a moment.', code: 'PLAN_CHECK_UNAVAILABLE' },
      { status: 503 },
    )
  }
}
