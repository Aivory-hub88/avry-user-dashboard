/**
 * Credential for agent turns nobody typed — SERVER-ONLY (ADR-019 P4).
 *
 * A proactive turn (room opened, file added) runs as the room's owner, the
 * same identity a mention from them would use, so the backend applies that
 * user's tier, tools and approval gate unchanged. The dashboard already
 * holds the JWT_SECRET that avry-backend signs access tokens with (it
 * verifies them in lib/serverAuth), so it mints a 2-minute access token
 * instead of the backend growing a new service endpoint:
 *
 * - only for an active, non-deleted, non-suspended user
 * - type "access" (never a refresh token), `proactive: true` so logs and
 *   future checks can tell it apart
 * - never leaves the server: handed straight to runAgentTask
 */
import jwt from "jsonwebtoken"
import { query } from "@/lib/db"
import type { WorkspaceCredential } from "@/lib/workspaceAuth"

export const PROACTIVE_TOKEN_TTL_S = 120

export async function ownerCredential(
  userId: string,
): Promise<Extract<WorkspaceCredential, { kind: "user" }> | null> {
  const secret = process.env.JWT_SECRET
  if (!secret) return null
  const r = await query(
    `SELECT id, email, username, full_name, account_type
     FROM identity.users
     WHERE id = $1 AND deleted_at IS NULL AND COALESCE(is_active, true)
       AND (suspended_until IS NULL OR suspended_until < now())`,
    [userId],
  )
  const u = r.rows[0] as { id: string; email: string; username: string | null; full_name: string | null; account_type: string | null } | undefined
  if (!u) return null
  const user = { user_id: u.id, email: u.email, account_type: u.account_type ?? "free" }
  const token = jwt.sign(
    { ...user, full_name: u.full_name, username: u.username, type: "access", proactive: true },
    secret,
    { algorithm: "HS256", expiresIn: PROACTIVE_TOKEN_TTL_S },
  )
  return { kind: "user", user, token }
}
