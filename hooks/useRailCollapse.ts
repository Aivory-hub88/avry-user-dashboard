"use client"
// Same pattern as useAgentColumnCollapse / useSidebarCollapse, own storage key.
import { useState, useEffect, useCallback } from "react"

const STORAGE_KEY = "aivory_rail_collapsed"

export function useRailCollapse() {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
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
