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
