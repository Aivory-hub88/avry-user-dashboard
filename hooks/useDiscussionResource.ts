"use client"

import { useEffect, useMemo, useState } from "react"
import { collabAuthHeaders } from "@/lib/collabClient"

function createRequest<T>(url: string | null, publish: (data: T | null, error: boolean) => void) {
  let active = false
  let controller: AbortController | null = null
  let pending = false
  const refresh = async () => {
    if (!active || !url || document.hidden) return
    if (controller) {
      pending = true
      return
    }
    const current = new AbortController()
    controller = current
    try {
      const response = await fetch(url, {
        headers: collabAuthHeaders(), signal: current.signal, cache: "no-store",
      })
      if (!response.ok) throw new Error("Could not refresh discussion")
      const data = await response.json() as T
      if (active && !current.signal.aborted) publish(data, false)
    } catch {
      if (active && !current.signal.aborted) publish(null, true)
    } finally {
      controller = null
      if (active && pending) {
        pending = false
        void refresh()
      }
    }
  }
  return {
    refresh,
    poll: () => { if (!controller) void refresh() },
    start: () => { active = true; void refresh() },
    stop: () => { active = false; pending = false; controller?.abort() },
  }
}

export function useDiscussionResource<T>(url: string | null) {
  const [snapshot, setSnapshot] = useState<{
    identity: object
    data: T | null
    error: boolean
  } | null>(null)
  const request = useMemo(() => {
    const identity = {}
    return {
      identity,
      ...createRequest<T>(url, (data, error) => setSnapshot((previous) => ({
        identity,
        data: error && previous?.identity === identity ? previous.data : data,
        error,
      }))),
    }
  }, [url])

  useEffect(() => {
    request.start()
    const timer = window.setInterval(request.poll, 5000)
    window.addEventListener("focus", request.poll)
    document.addEventListener("visibilitychange", request.poll)
    return () => {
      request.stop()
      window.clearInterval(timer)
      window.removeEventListener("focus", request.poll)
      document.removeEventListener("visibilitychange", request.poll)
    }
  }, [request])

  const current = snapshot?.identity === request.identity ? snapshot : null
  return {
    data: current?.data ?? null,
    loading: !!url && !current,
    error: current?.error ?? false,
    refresh: request.refresh,
  }
}
