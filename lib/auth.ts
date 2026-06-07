/**
 * Authentication Manager Integration
 * Provides functions to interact with AuthManager system and backend API
 * This is a shared module used by both frontend-nextjs and nextjs-console
 */

// Backend API base URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8081';

/**
 * User interface - matches backend UserResponse model
 */
export interface User {
  user_id: string;
  email: string;
  account_type: "free" | "superadmin";
  company_name?: string;
  created_at: string;
  tier: "free" | "snapshot" | "blueprint" | "enterprise";
  is_subscribed: boolean;
  has_diagnostic: boolean;
  has_snapshot: boolean;
  has_blueprint: boolean;
  credits: number;
  credits_max: number;
  token?: string;
}

/**
 * Auth tokens interface
 */
interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

/**
 * Auth response interface
 */
interface AuthResponse {
  user: User;
  tokens: TokenPair;
}

/**
 * Check if user is authenticated
 * @returns boolean indicating authentication status
 */
export function isAuthenticated(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  
  // Check localStorage for token
  const token = localStorage.getItem("auth_token");
  return !!token;
}

/**
 * Get current user object
 * @returns User object or null if not authenticated
 */
export function getUser(): User | null {
  if (typeof window === "undefined") {
    return null;
  }
  
  // Try to get user from localStorage
  const userJson = localStorage.getItem("user_data");
  if (userJson) {
    try {
      return JSON.parse(userJson) as User;
    } catch (e) {
      console.error("Failed to parse user data:", e);
    }
  }
  
  // Fallback to AuthManager if available
  if (typeof window.AuthManager !== "undefined") {
    return (window.AuthManager.getUser?.() || null) as User | null;
  }
  
  return null;
}

/**
 * Get user authentication token
 * @returns Authentication token or null
 */
export function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  
  // Try localStorage first
  const token = localStorage.getItem("auth_token");
  if (token) {
    return token;
  }
  
  // Fallback to AuthManager
  const user = getUser();
  return user?.token || null;
}

/**
 * Check if current user is admin
 * @returns boolean indicating if user is admin
 */
export function isAdmin(): boolean {
  const user = getUser();
  return user?.account_type === "superadmin";
}

/**
 * Get user role ("user" or "admin")
 * @returns "user" | "admin" | null
 */
export function getUserRole(): "user" | "admin" | null {
  if (!isAuthenticated()) {
    return null;
  }
  return isAdmin() ? "admin" : "user";
}

/**
 * Determine dashboard redirect URL based on user role
 * @returns URL to redirect user to (port 9001 for users, 9002 for admins)
 */
export function getDashboardUrl(): string {
  const user = getUser();
  if (!user) {
    throw new Error("User not authenticated");
  }
  
  // Route to admin dashboard if superadmin
  if (user.account_type === "superadmin") {
    return process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_URL || "http://localhost:9002";
  }
  
  // Route to user dashboard
  return process.env.NEXT_PUBLIC_CONSOLE_URL || "http://localhost:9001";
}

/**
 * Store auth tokens and user data locally
 */
function storeAuth(response: AuthResponse): void {
  if (typeof window === "undefined") {
    return;
  }
  
  // Store tokens
  localStorage.setItem("auth_token", response.tokens.access_token);
  localStorage.setItem("refresh_token", response.tokens.refresh_token);
  
  // Store user data with token for compatibility
  const userData = {
    ...response.user,
    token: response.tokens.access_token,
  };
  localStorage.setItem("user_data", JSON.stringify(userData));
  localStorage.setItem("auth_timestamp", new Date().toISOString());
  
  // Update AuthManager if available
  if (typeof window.AuthManager !== "undefined" && window.AuthManager?.setUser) {
    (window.AuthManager as any).setUser(userData);
  }
}

/**
 * Clear auth tokens and user data
 */
function clearAuth(): void {
  if (typeof window === "undefined") {
    return;
  }
  
  localStorage.removeItem("auth_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user_data");
  localStorage.removeItem("auth_timestamp");
  
  // Clear AuthManager if available
  if (typeof window.AuthManager !== "undefined" && window.AuthManager?.clearUser) {
    (window.AuthManager as any).clearUser?.();
  }
}

/**
 * Register new user with email and password
 * @param email - User's email address
 * @param password - User's password
 * @param company_name - Optional company name
 * @returns Promise resolving to redirect URL
 */
export async function signup(
  email: string,
  password: string,
  company_name?: string
): Promise<string> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        company_name,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || "Registration failed");
    }

    const data: AuthResponse = await response.json();
    
    // Store auth data
    storeAuth(data);
    
    // Dispatch login event
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("authManager:login"));
    }
    
    // Return dashboard URL
    return getDashboardUrl();
  } catch (error) {
    console.error("[Auth] Signup failed:", error);
    throw error;
  }
}

/**
 * Login user with email and password
 * @param email - User's email address
 * @param password - User's password
 * @returns Promise resolving to redirect URL
 */
export async function login(email: string, password: string): Promise<string> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || "Login failed");
    }

    const data: AuthResponse = await response.json();
    
    // Store auth data
    storeAuth(data);
    
    // Dispatch login event
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("authManager:login"));
    }
    
    // Return dashboard URL
    return getDashboardUrl();
  } catch (error) {
    console.error("[Auth] Login failed:", error);
    throw error;
  }
}

/**
 * Logout user
 */
export async function logout(): Promise<void> {
  try {
    const refreshToken = localStorage.getItem("refresh_token");
    
    // Call logout endpoint if we have a refresh token
    if (refreshToken) {
      await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }).catch((e) => {
        // Logout from backend is optional - proceed with local logout anyway
        console.error("[Auth] Logout endpoint error:", e);
      });
    }
  } finally {
    // Clear local auth data
    clearAuth();
    
    // Dispatch logout event
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("authManager:logout"));
    }
  }
}

/**
 * Get current user from backend (fetch fresh data)
 * @returns Promise resolving to fresh user data
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const token = getToken();
    if (!token) {
      return null;
    }

    const response = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired or invalid - clear auth
        clearAuth();
      }
      return null;
    }

    const user: User = await response.json();
    
    // Update stored user data
    const userData = {
      ...user,
      token,
    };
    localStorage.setItem("user_data", JSON.stringify(userData));
    
    return user;
  } catch (error) {
    console.error("[Auth] Get current user failed:", error);
    return null;
  }
}
