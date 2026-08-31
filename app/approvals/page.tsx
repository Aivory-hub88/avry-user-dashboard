"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"

/**
 * Approvals are no longer a page you visit — they live inside Console
 * itself (each agent's badge in the left column, the rail's "Waiting on
 * you"). This route stays alive only so an old bookmark or link still
 * lands somewhere useful instead of 404ing.
 *
 * No notification template in this codebase was found constructing a
 * `/approvals?id=...`-style link (checked email/Telegram send paths), so
 * there's no known consumer to preserve an exact query contract for — this
 * just forwards `id`/`approval` through in case one is ever added, without
 * building out agent-lookup-and-focus machinery nothing needs yet.
 */
export default function ApprovalsRedirect() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const id = searchParams.get("approval") ?? searchParams.get("id")
    router.replace(id ? `/console?approval=${encodeURIComponent(id)}` : "/console")
  }, [router, searchParams])

  return null
}
