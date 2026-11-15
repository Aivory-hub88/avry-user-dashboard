"use client"

import { useCallback, useEffect, useState } from "react"
import { collabAuthHeaders } from "@/lib/collabClient"
import type { MyTask } from "@/lib/myTasks"

/**
 * Open tasks that involve the viewer across rooms (GET /api/workspace/tasks/mine).
 * `tasks` is null while the first load runs; a failed load leaves [] and sets `error`.
 * `refreshKey` reloads (e.g. the pathname, so tab switches see fresh data).
 */
export function useMyTasks(refreshKey?: unknown): { tasks: MyTask[] | null; error: boolean; reload: () => void } {
  const [tasks, setTasks] = useState<MyTask[] | null>(null)
  const [error, setError] = useState(false)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let alive = true
    fetch("/api/workspace/tasks/mine", { headers: collabAuthHeaders(), cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { tasks?: MyTask[] }) => {
        if (!alive) return
        setTasks(Array.isArray(j.tasks) ? j.tasks : [])
        setError(false)
      })
      .catch(() => {
        if (!alive) return
        setTasks((prev) => prev ?? [])
        setError(true)
      })
    return () => {
      alive = false
    }
  }, [refreshKey, tick])

  return { tasks, error, reload }
}
