/**
 * AuthManager for Next.js Console
 * Wrapper around the global AuthManager from frontend/auth-manager.js
 *
 * Cross-subdomain session continuity:
 * The marketing site (aivory.id) writes the session via the legacy
 * `auth-manager.js`, which stores cookies scoped to `domain=.aivory.id`
 * (`SameSite=None; Secure`). Because the cookie is shared across every child
 * domain, a session established on `aivory.id` is readable on
 * `dashboard.aivory.id`. When the legacy global `window.AuthManager` is not
 * loaded in this standalone dashboard, these helpers fall back to reading the
 * shared cookie directly so the user is recognized as authenticated WITHOUT a
 * second sign-in. All cookie access is SSR-safe (no `document`/`window` access
 * during server render).
 */

export interface User {
  user_id: string
  email: string
  account_type: string
  role?: string
  company_name?: string
  tier: string
  is_subscribed: boolean
  has_diagnostic: boolean
  has_snapshot: boolean
  has_blueprint: boolean
  credits: number
  credits_max: number
}

// Shared cross-subdomain cookie keys written by legacy `auth-manager.js`.
// Values are stored as `encodeURIComponent(JSON.stringify(value))`.
const SHARED_COOKIE_KEYS = {
  SESSION_TOKEN: 'aivory_session_token',
  REFRESH_TOKEN: 'aivory_refresh_token',
  USER: 'aivory_user',
} as const

// Authoritative post-login redirect targets (per legacy `getRedirectUrl`).
// Note: the legacy stack contained stale `app.aivory.id` fallbacks; the
// authoritative dashboard target is `dashboard.aivory.id`.
const ADMIN_URL = 'https://admin.aivory.id'
const DASHBOARD_URL = 'https://dashboard.aivory.id'

const ADMIN_ACCOUNT_TYPES = ['superadmin', 'admin', 'employee']

/**
 * Read and parse a shared `.aivory.id` cookie value.
 * SSR-safe: returns null when `document` is unavailable.
 */
function readSharedCookie<T>(name: string): T | null {
  if (typeof document === 'undefined') return null

  const nameEQ = `${name}=`
  const cookies = document.cookie ? document.cookie.split(';') : []

  for (const raw of cookies) {
    const cookie = raw.trim()
    if (cookie.indexOf(nameEQ) === 0) {
      try {
        return JSON.parse(decodeURIComponent(cookie.substring(nameEQ.length))) as T
      } catch {
        return null
      }
    }
  }

  return null
}

/** Read the shared session token from the cross-subdomain cookie. */
function getSharedSessionToken(): string | null {
  const token = readSharedCookie<string>(SHARED_COOKIE_KEYS.SESSION_TOKEN)
  return typeof token === 'string' && token.trim() !== '' ? token : null
}

/** Read the shared user object from the cross-subdomain cookie. */
function getSharedUser(): User | null {
  return readSharedCookie<User>(SHARED_COOKIE_KEYS.USER)
}

/** Determine admin status from a shared-cookie user (legacy parity). */
function isAdminUser(user: User | null): boolean {
  if (!user) return false
  return (
    ADMIN_ACCOUNT_TYPES.includes(user.account_type) ||
    (typeof user.role === 'string' && ADMIN_ACCOUNT_TYPES.includes(user.role))
  )
}

export const AuthManager = {
  // Check if AuthManager is available
  isAvailable: () => {
    if (typeof window === 'undefined') return false
    return typeof (window as any).AuthManager !== 'undefined'
  },

  // Get AuthManager instance
  getInstance: () => {
    if (typeof window === 'undefined') return null
    return (window as any).AuthManager
  },

  // Check if user is authenticated.
  // Falls back to the shared cross-subdomain cookie so a session established on
  // aivory.id is recognized here without re-authenticating.
  // Also checks localStorage for tokens set by TokenInitializer from port 9000.
  isAuthenticated: (): boolean => {
    if (AuthManager.isAvailable()) return AuthManager.getInstance().isAuthenticated()
    
    // Check for shared cookies first (legacy)
    if (!!getSharedSessionToken() && !!getSharedUser()) {
      return true
    }
    
    // Check for localStorage token (cross-port authentication from port 9000)
    if (typeof localStorage !== 'undefined') {
      // Check shared aivory_auth session (from homepage login)
      const aivoryRaw = localStorage.getItem('aivory_auth')
      if (aivoryRaw) {
        try { const s = JSON.parse(aivoryRaw); if (s?.access_token) return true } catch {}
      }
      const token = localStorage.getItem('auth_token')
      const userData = localStorage.getItem('user_data')
      if (token && userData) {
        return true
      }
    }
    
    return false
  },

  // Get current user (from the global manager or the shared cookie or localStorage)
  getUser: (): User | null => {
    if (AuthManager.isAvailable()) {
      const user = AuthManager.getInstance().getUser()
      return user || null
    }
    
    // Check for shared cookie user first (legacy)
    const cookieUser = getSharedUser()
    if (cookieUser) {
      return cookieUser
    }
    
    // Check for localStorage user (cross-port authentication from port 9000)
    if (typeof localStorage !== 'undefined') {
      // Try aivory_auth first
      const _aiRaw = localStorage.getItem('aivory_auth')
      if (_aiRaw) {
        try {
          const _s = JSON.parse(_aiRaw); const _u = _s?.user
          if (_u) return { user_id: _u.id, email: _u.email, account_type: _u.user_metadata?.account_type || 'free', company_name: _u.user_metadata?.company_name, tier: _u.user_metadata?.tier || 'free', is_subscribed: false, has_diagnostic: false, has_snapshot: false, has_blueprint: false, credits: 0, credits_max: 0 } as any
        } catch {}
      }
      const userStr = localStorage.getItem('user_data')
      if (userStr) {
        try {
          return JSON.parse(userStr) as User
        } catch {
          return null
        }
      }
    }
    
    return null
  },

  // Get user ID
  getUserId: (): string | null => {
    if (AuthManager.isAvailable()) return AuthManager.getInstance().getUserId()
    
    // Check localStorage first
    if (typeof localStorage !== 'undefined') {
      const userId = localStorage.getItem('user_id')
      if (userId) return userId
      
      // Fallback: extract from user_data
      const userStr = localStorage.getItem('user_data')
      if (userStr) {
        try {
          const userData = JSON.parse(userStr)
          if (userData.user_id) {
            localStorage.setItem('user_id', userData.user_id)
            return userData.user_id
          }
        } catch {
          return null
        }
      }
    }
    
    // Check cookie fallback
    return getSharedUser()?.user_id ?? null
  },

  // Get the shared session access token (from the global manager or cookie or localStorage)
  getAccessToken: (): string | null => {
    if (AuthManager.isAvailable()) {
      const instance = AuthManager.getInstance()
      return typeof instance?.getAccessToken === 'function' ? instance.getAccessToken() : null
    }
    
    // Check for shared cookie token first (legacy)
    const cookieToken = getSharedSessionToken()
    if (cookieToken) {
      return cookieToken
    }
    
    // Check for localStorage token (cross-port authentication from port 9000)
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('auth_token')
    }
    
    return null
  },

  // Check if user is super admin
  isSuperAdmin: (): boolean => {
    if (AuthManager.isAvailable()) return AuthManager.getInstance().isSuperAdmin()
    return getSharedUser()?.account_type === 'superadmin'
  },

  // Check if user is admin
  isAdmin: (): boolean => {
    if (AuthManager.isAvailable()) return AuthManager.getInstance().isAdmin()
    return isAdminUser(getSharedUser())
  },

  // Get role-based post-login redirect URL.
  // Admins/employees → admin panel; regular users → product dashboard.
  getRedirectUrl: (): string => {
    if (AuthManager.isAvailable()) return AuthManager.getInstance().getRedirectUrl()
    return isAdminUser(getSharedUser()) ? ADMIN_URL : DASHBOARD_URL
  },

  // Register new user
  register: async (email: string, password: string, companyName?: string) => {
    if (!AuthManager.isAvailable()) throw new Error('AuthManager not available')
    return AuthManager.getInstance().register(email, password, companyName)
  },

  // Login user
  login: async (email: string, password: string) => {
    if (!AuthManager.isAvailable()) throw new Error('AuthManager not available')
    return AuthManager.getInstance().login(email, password)
  },

  // Logout user
  logout: async () => {
    if (!AuthManager.isAvailable()) return
    await AuthManager.getInstance().logout()
  },

  // Get current user from server, falling back to the shared cookie user
  // so a cross-subdomain session is still surfaced when the global manager
  // is not loaded in this standalone dashboard.
  getCurrentUser: async (): Promise<User | null> => {
    if (AuthManager.isAvailable()) return AuthManager.getInstance().getCurrentUser()
    return getSharedUser()
  },

  // Subscribe to auth state changes
  onAuthStateChange: (callback: (user: User | null) => void) => {
    if (!AuthManager.isAvailable()) return
    AuthManager.getInstance().onAuthStateChange(callback)
  },

  // Refresh access token
  refreshAccessToken: async (): Promise<string | null> => {
    if (!AuthManager.isAvailable()) return null
    try {
      return await AuthManager.getInstance().refreshAccessToken()
    } catch {
      return null
    }
  },

  // Make authenticated fetch
  authenticatedFetch: async (url: string, options?: RequestInit) => {
    if (!AuthManager.isAvailable()) throw new Error('AuthManager not available')
    return AuthManager.getInstance().authenticatedFetch(url, options)
  },
}
