'use client'

import { useEffect } from 'react'
import { keepSessionFresh } from '@/lib/deployAuth'

const CHECK_EVERY_MS = 5 * 60_000

/** Keeps the access token (and the cookies server routes read) fresh in the
 *  background, so a session never silently lapses while the user is away. */
export default function SessionKeepAlive() {
  useEffect(() => {
    const run = () => {
      void keepSessionFresh()
    }
    run()
    const id = window.setInterval(run, CHECK_EVERY_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') run()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', run)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', run)
    }
  }, [])
  return null
}
