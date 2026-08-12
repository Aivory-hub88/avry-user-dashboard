"use client"
import { useState, useEffect, useCallback } from "react"

const STORAGE_KEY = "aivory_sidebar_collapsed"

export function useSidebarCollapse() {
  // Start uncollapsed — safe for SSR. Client will correct after mount.
  const [collapsed, setCollapsed] = useState(false)

  // Read the stored preference after mount (client-only)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      // Standard fetch-on-mount / sync-from-prop / hydrate-after-mount pattern
      // (functionally correct in this pre-Suspense/pre-React-Query codebase) —
      // not restructuring this component's data flow to satisfy the newer
      // React Compiler style rule; see other documented instances of this.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored === "true") setCollapsed(true)
    } catch {
      // localStorage unavailable
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed))
    } catch {
      // localStorage unavailable
    }
  }, [collapsed])

  const toggle = useCallback(() => {
    setCollapsed((prev) => !prev)
  }, [])

  return { collapsed, toggle }
}
