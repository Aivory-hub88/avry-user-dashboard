'use client'

import { useState, useEffect, useCallback } from 'react'

const THRESHOLD = 100 // pixels from bottom

export function useAutoScroll(
  containerRef: React.RefObject<HTMLElement | null>,
  deps: unknown[] = []
): { scrollToBottom: () => void; isAtBottom: boolean } {
  const [isAtBottom, setIsAtBottom] = useState(true)

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    })
  }, [containerRef])

  // Track scroll position via passive listener
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight
      setIsAtBottom(distanceFromBottom <= THRESHOLD)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [containerRef])

  // Auto-scroll on content change when at bottom
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { scrollToBottom, isAtBottom }
}
