"use client"
import { useState, useMemo, useCallback, useEffect } from "react"
import { Conversation, ConversationGroup } from "@/types/conversation"

const STORAGE_KEY = "aivory_conversation_history"

const seedConversations: Conversation[] = [
  { id: "1", title: "Project Architecture Discussion", updatedAt: new Date(), pinned: true },
  { id: "2", title: "API Design Review", updatedAt: new Date(), pinned: false },
  { id: "3", title: "Database Schema Planning", updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000), pinned: true },
  { id: "4", title: "Frontend Component Structure", updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), pinned: false },
  { id: "5", title: "Authentication Flow", updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), pinned: false },
  { id: "6", title: "Performance Optimization", updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), pinned: false },
  { id: "7", title: "Security Audit", updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), pinned: false },
  { id: "8", title: "Deployment Strategy", updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), pinned: false },
  { id: "9", title: "Monitoring Setup", updatedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), pinned: false },
  { id: "10", title: "Legacy Code Migration", updatedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), pinned: false },
]

export function useConversationHistory() {
  const [conversations, setConversations] = useState<Conversation[]>(seedConversations)

  // Load from localStorage after mount (client-only)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        setConversations(parsed.map((c: any) => ({ ...c, updatedAt: new Date(c.updatedAt) })))
      }
    } catch {
      // localStorage unavailable or parse error — keep seed data
    }
  }, [])

  const [searchQuery, setSearchQuery] = useState("")

  // Persist to localStorage (client-only, after mount)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
    } catch {
      // localStorage unavailable
    }
  }, [conversations])

  // Derived state
  const pinnedConversations = useMemo(() => {
    return conversations.filter((c) => c.pinned).slice(0, 5)
  }, [conversations])

  const groupedConversations = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const sevenDaysAgo = new Date(today)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const result: Record<ConversationGroup, Conversation[]> = {
      Today: [],
      Yesterday: [],
      "Last 7 Days": [],
      Older: [],
    }

    conversations.forEach((c) => {
      const updatedAt = new Date(c.updatedAt)
      updatedAt.setHours(0, 0, 0, 0)

      if (updatedAt.getTime() === today.getTime()) {
        result.Today.push(c)
      } else if (updatedAt.getTime() === yesterday.getTime()) {
        result.Yesterday.push(c)
      } else if (updatedAt.getTime() > sevenDaysAgo.getTime()) {
        result["Last 7 Days"].push(c)
      } else {
        result.Older.push(c)
      }
    })

    return result
  }, [conversations])

  // Search filtering (only non-pinned)
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return groupedConversations
    return {
      Today: groupedConversations.Today.filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase())),
      Yesterday: groupedConversations.Yesterday.filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase())),
      "Last 7 Days": groupedConversations["Last 7 Days"].filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase())),
      Older: groupedConversations.Older.filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase())),
    }
  }, [groupedConversations, searchQuery])

  // Actions
  const pinConversation = useCallback((id: string) => {
    setConversations((prev) => {
      const existing = prev.find((c) => c.id === id)
      if (!existing) return prev
      if (existing.pinned) return prev
      const pinnedCount = prev.filter((c) => c.pinned).length
      if (pinnedCount >= 5) return prev
      return prev.map((c) => (c.id === id ? { ...c, pinned: true } : c))
    })
  }, [])

  const unpinConversation = useCallback((id: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: false } : c)))
  }, [])

  const renameConversation = useCallback((id: string, newTitle: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c)))
  }, [])

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id))
  }, [])

  return {
    conversations,
    pinnedConversations,
    groupedConversations,
    filteredConversations,
    searchQuery,
    setSearchQuery,
    pinConversation,
    unpinConversation,
    renameConversation,
    deleteConversation,
  }
}
