'use client'

/**
 * User Profile Component
 * Displays logged-in user info and logout button in the dashboard header
 */

import { useEffect, useState } from 'react'
import { ChevronsUpDown, User as UserIcon } from 'lucide-react'
import { logout, getUser } from '@/lib/auth'
import { getMarketingUrl } from '@/lib/config'
import { planLabel } from '@/lib/tiers'
import { SettingsModal, User } from '@/components/settings/SettingsModal'
import { useSettingsModal } from '@/contexts/SettingsModalContext'

// User interface moved to SettingsModal
export function UserProfile() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { openSettingsModal } = useSettingsModal()

  useEffect(() => {
    const loadUser = () => {
      try {
        const authUser = getUser()
        if (authUser) {
          setUser({
            user_id: authUser.user_id || 'unknown',
            email: authUser.email || 'unknown',
            account_type: authUser.account_type || 'user',
            tier: authUser.tier,
          })
        }
      } catch (error) {
        console.error('[UserProfile] Failed to load user:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadUser()

    // Listen for auth changes
    const handleLogin = () => loadUser()
    const handleLogout = () => setUser(null)

    if (typeof window !== 'undefined') {
      window.addEventListener('authManager:login', handleLogin)
      window.addEventListener('authManager:logout', handleLogout)

      return () => {
        window.removeEventListener('authManager:login', handleLogin)
        window.removeEventListener('authManager:logout', handleLogout)
      }
    }
  }, [])

  const handleLogout = async () => {
    try {
      await logout()
      setUser(null)
      // Redirect to homepage — resolved per environment; the old hardcoded
      // http://localhost:9000 sent production users to a dead page.
      if (typeof window !== 'undefined') {
        window.location.href = getMarketingUrl()
      }
    } catch (error) {
      console.error('[UserProfile] Logout failed:', error)
      alert('Failed to logout. Please try again.')
    }
  }

  if (isLoading) {
    return null
  }

  const displayEmail = user?.email || 'guest@aivory.id'
  const displayUsername = user ? user.email.split('@')[0] : 'Guest'
  const displayTier = planLabel(user?.tier, user?.account_type)

  return (
    <>
      <div className="border-t border-white/5 p-2">
        <button
          onClick={() => openSettingsModal()}
          aria-label="Open account settings"
          className="group flex w-full items-center gap-3 rounded-2xl border border-transparent px-2.5 py-2 text-left transition-all duration-200 hover:border-white/10 hover:bg-white/[0.05] active:scale-[0.99]"
        >
          <div className="shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-white/20 to-white/[0.04] text-white/70 ring-1 ring-white/15">
              <UserIcon size={16} strokeWidth={2} />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-tight text-white">{displayUsername}</p>
            <span className="mt-1 inline-block rounded-full bg-white/[0.08] px-2 py-px text-[9.5px] font-semibold uppercase tracking-[0.08em] text-white/60">
              {displayTier}
            </span>
          </div>
          <ChevronsUpDown size={15} strokeWidth={2} className="shrink-0 text-white/30 transition-colors group-hover:text-white/70" />
        </button>
      </div>

      <SettingsModal user={user} />
    </>
  )
}

export default UserProfile
