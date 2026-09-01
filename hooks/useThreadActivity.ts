'use client'
/**
 * Derives "a reply arrived in a thread you're not currently looking at"
 * client-side, with zero fetches — no backend event log exists for this
 * (see docs/CERVEAU-WORKING-OFFICE-PLANNING.md, Phase 10's "ringan"
 * constraint), so it's computed from data useChat already holds.
 *
 * A thread's "last seen" state is a fingerprint of its last message
 * (`length:count:tail`), not its `updatedAt` — chatPersistence.ts's
 * saveSessionMessages() unconditionally bumps `updatedAt` on every save,
 * including the content-preserving save switchSession() does on the
 * thread you're LEAVING, so updatedAt alone flags every thread you ever
 * switch away from as "new activity" (caught live: switching from thread A
 * to B immediately marked A itself as unseen). Message *count* alone
 * doesn't work either: a delayed reply resolving after you've switched
 * away (see useChat.ts's own handling of that race) fills the content of
 * a placeholder message that was already counted at send time, so the
 * count never changes — only the fingerprint does.
 *
 * First sighting of any thread (a fresh browser, or a thread created just
 * now) stamps its current fingerprint as the baseline immediately, rather
 * than defaulting to empty — otherwise every pre-existing thread would
 * read as "new activity" the moment this hook first runs.
 */
import { useEffect, useMemo, useState } from 'react'
import type { ChatSession } from './useChat'

const STORAGE_KEY = 'aivory_thread_last_seen'

function fingerprint(session: ChatSession): string {
  const last = session.messages[session.messages.length - 1]
  if (!last) return '0:'
  return `${session.messages.length}:${last.content.length}:${last.content.slice(-16)}`
}

function readSeenMap(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writeSeenMap(map: Record<string, string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Best-effort — activity badges just degrade to "no unseen activity"
    // if storage is full or blocked, same posture as chatPersistence.ts.
  }
}

export interface ActivityItem {
  sessionId: string
  title: string
  updatedAt: number
}

export function useThreadActivity(
  sessionsByAgent: Record<string, ChatSession[]>,
  currentSessionId: string,
) {
  const [seen, setSeen] = useState<Record<string, string>>(() => readSeenMap())

  // Baseline any thread we haven't tracked yet at its current fingerprint.
  // Sync-from-prop pattern: same documented convention as useChat.ts's
  // session-restore effect and AgentColumn's approval-arrival tracking.
  useEffect(() => {
    const all = Object.values(sessionsByAgent).flat()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeen((prev) => {
      let changed = false
      const next = { ...prev }
      for (const s of all) {
        if (!(s.id in next)) {
          next[s.id] = fingerprint(s)
          changed = true
        }
      }
      if (!changed) return prev
      writeSeenMap(next)
      return next
    })
  }, [sessionsByAgent])

  // Keep the active thread's fingerprint current for as long as it's open.
  useEffect(() => {
    if (!currentSessionId) return
    const active = Object.values(sessionsByAgent).flat().find((s) => s.id === currentSessionId)
    if (!active) return
    const fp = fingerprint(active)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeen((prev) => {
      if (prev[currentSessionId] === fp) return prev
      const next = { ...prev, [currentSessionId]: fp }
      writeSeenMap(next)
      return next
    })
  }, [currentSessionId, sessionsByAgent])

  const activityByAgent = useMemo(() => {
    const result: Record<string, ActivityItem[]> = {}
    for (const [agentKey, threads] of Object.entries(sessionsByAgent)) {
      const items = threads
        .filter((t) => t.id !== currentSessionId && t.messages.length > 0 && fingerprint(t) !== (seen[t.id] ?? fingerprint(t)))
        .map((t) => ({ sessionId: t.id, title: t.title || 'New chat', updatedAt: t.updatedAt }))
      if (items.length > 0) result[agentKey] = items
    }
    return result
  }, [sessionsByAgent, seen, currentSessionId])

  return { activityByAgent }
}
