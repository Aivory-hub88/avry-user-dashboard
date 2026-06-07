'use client'

/**
 * TokenInitializer Component
 * 
 * Handles cross-port authentication by reading the token and user from URL parameters
 * (passed from port 9000) and storing them in localStorage for port 9001.
 * 
 * This allows users to seamlessly transition from the homepage (port 9000)
 * to the dashboard (port 9001) without losing their authentication.
 */

import { useEffect } from 'react'

export function TokenInitializer() {
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return

    try {
      // Get token and user from URL parameters
      const params = new URLSearchParams(window.location.search)
      const token = params.get('token')
      const userStr = params.get('user')

      if (token) {
        // Store token in localStorage
        localStorage.setItem('auth_token', token)
        
        // Store user data if provided
        if (userStr) {
          try {
            const userData = JSON.parse(decodeURIComponent(userStr))
            // Ensure token is included in user data
            userData.token = token
            localStorage.setItem('user_data', JSON.stringify(userData))
            
            // Also ensure user_id is stored for AuthManager
            if (userData.user_id) {
              localStorage.setItem('user_id', userData.user_id)
            }
          } catch (e) {
            console.warn('[TokenInitializer] Failed to parse user data:', e)
          }
        }
        
        // Remove parameters from URL to keep it clean
        // Replace the current URL without the token/user parameters
        const newUrl = window.location.origin + window.location.pathname
        window.history.replaceState({ path: newUrl }, '', newUrl)
        
        // Dispatch login event to notify other components
        window.dispatchEvent(new Event('authManager:login'))
        
        console.log('[TokenInitializer] Token and user data initialized')
      }
    } catch (error) {
      console.error('[TokenInitializer] Failed to process authentication:', error)
    }
  }, [])

  return null
}
