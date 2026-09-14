"use client"
/**
 * Tracks an in-progress @mention inside a controlled textarea and drives the
 * AgentMentionMenu (LobeHub-style group-chat mention, but the member list is
 * the user's *deployed* agents, not a static roster).
 *
 * Stateless by design: the caller owns the text value and caret. Call
 * `checkForMention(text, caret)` from onChange/onSelect with fresh values
 * (avoids stale-closure reads), and `applyMention()` to splice the chosen
 * candidate in.
 */

import { useMemo, useState, useCallback, type RefObject } from "react"
import type { MentionCandidate } from "@/lib/agentMentions"

/** The @token directly before `caret`, if any: "@", "@te", ... */
const ACTIVE_TOKEN = /(^|\s)@([A-Za-z0-9_]*)$/

interface UseAgentMentionParams {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  candidates: MentionCandidate[]
  enabled: boolean
}

export function useAgentMention({ textareaRef, candidates, enabled }: UseAgentMentionParams) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    if (!q) return candidates
    return candidates.filter(
      (c) =>
        c.name.toLowerCase().startsWith(q) ||
        c.type.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q),
    )
  }, [candidates, query])

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
    setQuery("")
    setActiveIndex(0)
  }, [])

  const checkForMention = useCallback(
    (text: string, caret: number) => {
      if (!enabled) {
        setMenuOpen(false)
        return
      }
      const m = ACTIVE_TOKEN.exec(text.slice(0, caret))
      if (!m) {
        setMenuOpen(false)
        return
      }
      setQuery(m[2])
      setActiveIndex(0)
      setMenuOpen(true)
    },
    [enabled],
  )

  /**
   * Splices `@query` → `@Name ` at the caret. Returns the new text + caret
   * so the caller can setState and restore the cursor in one frame.
   */
  const applyMention = useCallback(
    (candidate: MentionCandidate, text: string, caret: number): { text: string; caret: number } | null => {
      const before = text.slice(0, caret)
      const m = ACTIVE_TOKEN.exec(before)
      if (!m) return null
      const tokenStart = caret - m[2].length - 1 // include the "@"
      const next = `${text.slice(0, tokenStart)}@${candidate.name} ${text.slice(caret)}`
      return { text: next, caret: tokenStart + candidate.name.length + 2 }
    },
    [],
  )

  const focusAndRestore = useCallback(
    (caret: number) => {
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        el.focus()
        try {
          el.setSelectionRange(caret, caret)
        } catch {
          /* non-text inputs — ignore */
        }
      })
    },
    [textareaRef],
  )

  return {
    menuOpen: menuOpen && enabled,
    mentionQuery: query,
    mentionList: filtered,
    mentionIndex: activeIndex,
    setMentionIndex: setActiveIndex,
    checkForMention,
    applyMention,
    focusAndRestore,
    closeMenu,
  }
}
