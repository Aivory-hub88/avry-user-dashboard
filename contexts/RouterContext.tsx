"use client"

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export interface RoutingContext {
  triggerMessage: string
  aiReplySummary: string
  targetRoute: string
  timestamp: number
  maxAge?: number  // Maximum age in milliseconds (default: 5 minutes)
}

interface RouterContextValue {
  pendingContext: RoutingContext | null
  setPendingContext: (ctx: RoutingContext) => void
  clearPendingContext: () => void
}

const RouterContext = createContext<RouterContextValue | null>(null)

const SESSION_KEY = 'aivory:routing:ctx'
const DEFAULT_MAX_AGE = 5 * 60 * 1000  // 5 minutes

export function RouterProvider({ children }: { children: ReactNode }) {
  const [pendingContext, setPendingContextState] = useState<RoutingContext | null>(null)

  const setPendingContext = useCallback((ctx: RoutingContext) => {
    const contextWithMaxAge = {
      ...ctx,
      maxAge: ctx.maxAge ?? DEFAULT_MAX_AGE
    }
    setPendingContextState(contextWithMaxAge)
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(contextWithMaxAge))
    } catch {}
  }, [])

  const clearPendingContext = useCallback(() => {
    setPendingContextState(null)
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {}
  }, [])

  return (
    <RouterContext.Provider value={{ pendingContext, setPendingContext, clearPendingContext }}>
      {children}
    </RouterContext.Provider>
  )
}

export function useRouterContext(): RouterContextValue {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error('useRouterContext must be used within RouterProvider')
  return ctx
}
