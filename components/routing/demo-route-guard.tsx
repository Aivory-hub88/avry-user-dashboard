'use client'

/**
 * DemoRouteGuard — locks demo accounts to their allowed module subset.
 *
 * Demo accounts (account_type === 'demo') may only use the modules chosen
 * for them at creation time in the admin dashboard (see `lib/moduleAccess.ts`
 * and the account's `allowed_modules`). The sidebar already hides the other
 * entries, but the routes remain directly reachable by URL — this guard
 * redirects a demo account that lands on a locked route back to its home
 * module. Non-demo accounts are never affected.
 *
 * This is a client-side guard, consistent with how the dashboard gates access
 * today (there is no `middleware.ts`; `DashboardEntryGate` is also client-side).
 */

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AuthManager } from '@/lib/authManager'
import { isDemoAccount, isPathAllowedForDemo, DEMO_HOME_PATH, isPathAllowedForTeam, teamHomePath } from '@/lib/moduleAccess'
import { useTeamAccess } from '@/hooks/useTeamAccess'

export function DemoRouteGuard() {
  const pathname = usePathname() || ''
  const router = useRouter()
  const team = useTeamAccess()

  useEffect(() => {
    const user = AuthManager.getUser()
    if (!isDemoAccount(user?.account_type ?? null)) return
    if (isPathAllowedForDemo(pathname, user?.allowed_modules)) return
    router.replace(DEMO_HOME_PATH)
  }, [pathname, router])

  // Team-granted accounts: lock modules the team admin didn't enable.
  useEffect(() => {
    if (!team.restricted || isPathAllowedForTeam(pathname, team.modules)) return
    router.replace(teamHomePath(team.modules))
  }, [pathname, router, team])

  return null
}

export default DemoRouteGuard
