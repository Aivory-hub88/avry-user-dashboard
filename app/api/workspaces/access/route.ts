import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/serverAuth'
import { teamAccessFor } from '@/lib/teamAccess'

export const runtime = 'nodejs'

/** What the signed-in user may use through their team grants (sidebar + route guard). */
export async function GET(req: NextRequest) {
  const user = getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await teamAccessFor(user.user_id, user.account_type))
  } catch (e) {
    console.error('[workspaces/access]', e)
    // Fail open: the client treats this as "not restricted".
    return NextResponse.json({ restricted: false, modules: [] })
  }
}
