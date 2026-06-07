"use client"

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { classifyIntent, ClassifiedIntent } from '@/lib/intentClassifier'
import { useRouterContext } from '@/contexts/RouterContext'

const TAB_PATHS: Record<string, string> = {
  diagnostic: '/diagnostics',
  blueprint: '/blueprint',
  workflow: '/workflows',
  integration: '/integrations',
  roadmap: '/roadmap',
  settings: '/settings',
  dashboard: '/dashboard',
  console: '/console',
}

interface UseIntentRouterReturn {
  pendingRoute: ClassifiedIntent | null
  isClassifying: boolean
  triggerClassification: (userMsg: string, aiReply: string) => void
  dismissRoute: () => void
  acceptRoute: () => void
}

export function useIntentRouter(): UseIntentRouterReturn {
  const [pendingRoute, setPendingRoute] = useState<ClassifiedIntent | null>(null)
  const [isClassifying, setIsClassifying] = useState(false)
  const lastKeyRef = useRef<string>('')
  const cancelledRef = useRef<boolean>(false)
  const router = useRouter()
  const { setPendingContext } = useRouterContext()

  const triggerClassification = useCallback((userMsg: string, aiReply: string): void => {
    console.log('[useIntentRouter] triggerClassification called')
    // Deduplicate — skip if same message as last classification
    const key = userMsg.trim().slice(0, 100)
    console.log('[useIntentRouter] key:', key, '| lastKeyRef.current:', lastKeyRef.current)
    if (key === lastKeyRef.current) {
      console.log('[useIntentRouter] deduplication — skipping')
      return
    }
    lastKeyRef.current = key

    // Cancel any in-flight classification
    cancelledRef.current = true
    setPendingRoute(null)

    // Reset cancel flag for this new run
    cancelledRef.current = false
    setIsClassifying(true)

    // Fire and forget — NEVER awaited, NEVER blocks — chat stream
    console.log('[useIntentRouter] calling classifyIntent...')
    classifyIntent(userMsg, aiReply)
      .then((result) => {
        console.log('[useIntentRouter] classifyIntent result:', result)
        if (cancelledRef.current) {
          console.log('[useIntentRouter] classification cancelled')
          return
        }
        setIsClassifying(false)
        // Show banner for all non-console routes regardless of confidence
        if (result.route !== 'console') {
          console.log('[useIntentRouter] ✅ setting pendingRoute:', result.route, '| confidence:', result.confidence)
          setPendingRoute(result)
        } else {
          console.log('[useIntentRouter] ❌ not setting pendingRoute — route:', result.route)
        }
      })
      .catch((err) => {
        console.log('[useIntentRouter] classifyIntent error:', err)
        // Silent fail — intent classification is best-effort
        if (!cancelledRef.current) setIsClassifying(false)
      })
  }, [])

  const dismissRoute = useCallback((): void => {
    cancelledRef.current = true

    setPendingRoute(null)
    setIsClassifying(false)
  }, [])

  const acceptRoute = useCallback((): void => {
    if (!pendingRoute) return
    const path = TAB_PATHS[pendingRoute.route] ?? '/console'
    setPendingContext({
      triggerMessage: lastKeyRef.current,
      aiReplySummary: '',
      targetRoute: pendingRoute.route,
      timestamp: Date.now(),
      maxAge: 5 * 60 * 1000,  // 5 minutes
    })
    setPendingRoute(null)
    cancelledRef.current = true
    router.push(path)
  }, [pendingRoute, router, setPendingContext])

  return { pendingRoute, isClassifying, triggerClassification, dismissRoute, acceptRoute }
}