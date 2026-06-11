'use client'

/**
 * User Profile Component
 * Displays logged-in user info and logout button in the dashboard header
 */

import { useEffect, useState } from 'react'
import { logout, getUser } from '@/lib/auth'
import { SettingsModal, User } from '@/components/settings/SettingsModal'

// User interface moved to SettingsModal
export function UserProfile() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    const loadUser = () => {
      try {
        const authUser = getUser()
        if (authUser) {
          setUser({
            user_id: authUser.user_id || 'unknown',
            email: authUser.email || 'unknown',
            account_type: authUser.account_type || 'user',
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
      // Redirect to homepage
      if (typeof window !== 'undefined') {
        window.location.href = 'http://localhost:9000'
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
  const displayTier = user?.account_type === 'superadmin' ? 'Admin' : 'Pro'
  const initial = displayUsername.charAt(0).toUpperCase()

  return (
    <>
      <button 
        onClick={() => setIsModalOpen(true)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-t border-white/5 text-left group"
      >
        <div className="w-8 h-8 rounded-full bg-[#b7cba6] flex items-center justify-center text-[#1a0b2e] font-bold text-sm shrink-0">
          {initial}
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <p className="text-sm font-semibold text-white truncate">{displayUsername}</p>
          <p className="text-[11px] font-bold text-[#b7cba6] uppercase tracking-wider">{displayTier}</p>
        </div>
        <div className="text-white/30 group-hover:text-white/70 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="1"></circle>
            <circle cx="19" cy="12" r="1"></circle>
            <circle cx="5" cy="12" r="1"></circle>
          </svg>
        </div>
      </button>

      <SettingsModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        user={user} 
      />
    </>
  )
}

export default UserProfile
