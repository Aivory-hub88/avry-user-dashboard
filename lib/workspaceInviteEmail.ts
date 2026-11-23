/**
 * Tell a freshly added workspace member by email. The member row is already in
 * the database by the time this runs, so it is best effort: it never throws and
 * the caller only reports whether the mail went out.
 *
 * The backend owns SMTP (app/services/email_service.py) and re-checks that the
 * caller is the one who added the member, so we forward the caller's own JWT.
 */
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

export async function sendInviteEmail(token: string, workspaceId: string, userId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/workspace-invites/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ workspace_id: workspaceId, user_id: userId }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      console.error('[workspaces/members invite email]', res.status)
      return false
    }
    const data = (await res.json()) as { sent?: boolean }
    return data.sent === true
  } catch (e) {
    console.error('[workspaces/members invite email]', e)
    return false
  }
}
