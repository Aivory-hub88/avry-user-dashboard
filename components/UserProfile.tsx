'use client'

/**
 * User Profile Component
 * Displays logged-in user info and logout button in the dashboard header
 */

import { useEffect, useState } from 'react'
import { logout, getUser } from '@/lib/auth'

interface User {
  user_id: string
  email: string
  account_type: string
}

export function UserProfile() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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

  if (!user) {
    return null
  }

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-t border-[#453f3b]">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/80 truncate">{user.email}</p>
        <p className="text-xs text-white/50">
          {user.account_type === 'superadmin' ? 'Admin User' : 'User'}
        </p>
      </div>
      <button
        onClick={handleLogout}
        className="px-3 py-1 text-xs font-medium text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded transition-colors"
        title="Logout and return to homepage"
      >
        Logout
      </button>
    </div>
  )
}

export default UserProfile
