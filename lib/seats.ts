/**
 * Workspace seats: how many people an account may bring into the workspaces it
 * owns. A seat is a person, not a membership: the owner plus every distinct
 * user who is a member of at least one workspace that owner owns. Counting
 * across all of the owner's workspaces means a second workspace doesn't buy a
 * second allowance.
 *
 * The limit comes from the OWNER's live plan (`identity.user_tiers`), not from
 * whoever is clicking Invite, so a co-admin can't add people beyond the plan
 * the owner pays for. Members already over the limit (e.g. after a downgrade)
 * keep their access; only new people are refused.
 */

import { query } from '@/lib/db'
import { isSuperAdminAccount, NO_PLAN_SEAT_LIMIT, TIER_ALIASES, TIER_SEAT_LIMIT, type SubscriptionTier } from '@/lib/tiers'

export interface SeatUsage {
  /** People counted, the owner included. */
  used: number
  /** null = unlimited (platform admin owner). */
  limit: number | null
}

/** Pure: the seat limit for an owner's plan. */
export function seatLimitFor(tier: string | null | undefined, override: number | null | undefined, accountType?: string | null): number | null {
  if (isSuperAdminAccount(accountType)) return null
  if (typeof override === 'number' && override > 0) return override
  const t = (tier ?? '').toLowerCase()
  const canonical = (TIER_ALIASES[t] ?? t) as SubscriptionTier
  return TIER_SEAT_LIMIT[canonical] ?? NO_PLAN_SEAT_LIMIT
}

/**
 * Pure: may `targetId` be added? A person already holding a seat (the owner,
 * or a member of another of the owner's workspaces) costs nothing extra.
 */
export function canTakeSeat(usage: SeatUsage, alreadySeated: boolean): boolean {
  if (alreadySeated || usage.limit === null) return true
  return usage.used < usage.limit
}

/** The owner's seat usage. Throws on DB errors so callers can fail closed. */
export async function ownerSeatUsage(ownerId: string): Promise<SeatUsage> {
  const plan = await query(
    `SELECT u.account_type, t.tier, t.seat_limit
       FROM identity.users u
       LEFT JOIN identity.user_tiers t
         ON t.user_id = u.id AND (t.expires_at IS NULL OR t.expires_at > now())
      WHERE u.id = $1`,
    [ownerId],
  )
  const row = plan.rows[0] as { account_type?: string; tier?: string | null; seat_limit?: number | null } | undefined
  const used = await query(
    `SELECT count(DISTINCT m.user_id)::int AS n
       FROM dashboard.workspace_members m
       JOIN dashboard.workspaces w ON w.id = m.workspace_id
      WHERE w.owner = $1 AND m.user_id <> $1`,
    [ownerId],
  )
  return {
    used: 1 + Number((used.rows[0] as { n?: number } | undefined)?.n ?? 0),
    limit: seatLimitFor(row?.tier, row?.seat_limit, row?.account_type),
  }
}

/** True when `userId` already holds one of the owner's seats. */
export async function holdsSeat(ownerId: string, userId: string): Promise<boolean> {
  if (userId === ownerId) return true
  const r = await query(
    `SELECT 1 FROM dashboard.workspace_members m
       JOIN dashboard.workspaces w ON w.id = m.workspace_id
      WHERE w.owner = $1 AND m.user_id = $2 LIMIT 1`,
    [ownerId, userId],
  )
  return (r.rowCount ?? 0) > 0
}
