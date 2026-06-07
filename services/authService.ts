/**
 * Server-side Auth Service
 * Provides authentication utilities for Next.js server components
 */

import { cookies } from 'next/headers'
import { JWT_SECRET } from '@/lib/jwt'

export interface User {
  user_id: string
  email: string
  account_type: string
  company_name?: string
  tier: string
  is_subscribed: boolean
  has_diagnostic: boolean
  has_snapshot: boolean
  has_blueprint: boolean
  credits: number
  credits_max: number
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('aivory_session_token')?.value

    if (!token) {
      return null
    }

    const response = await fetch(
      `${process.env.API_BASE_URL || 'http://localhost:8081'}/api/v1/auth/me`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }
    )

    if (!response.ok) {
      return null
    }

    return await response.json()
  } catch (error) {
    console.error('Auth service error:', error)
    return null
  }
}

export async function isAuthenticated(): Promise<boolean> {
  return !!await getCurrentUser()
}
