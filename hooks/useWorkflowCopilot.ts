'use client'

/**
 * useWorkflowCopilot
 * Single-path multi-turn copilot hook with localStorage persistence.
 *
 * Key features:
 * - ONE function (sendMessage) — server state machine decides routing
 * - Stores full `currentState` from API and sends it back every request
 * - Messages + serverState persisted to localStorage so they survive panel close/open
 * - reset() only called by explicit "Clear" button, NOT on open/close
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  sendCopilotMessage,
  type CopilotApiResponse,
  type CopilotConversationState,
  type GeneratedWorkflow,
  type TestResult,
} from '@/lib/workflows/copilotClient'

export interface CopilotMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface UseWorkflowCopilotReturn {
  messages: CopilotMessage[]
  loading: boolean
  loadingHint: string | null   // progressive hint: null → "working..." → "still working..."
  error: string | null
  stage: CopilotConversationState['stage']
  workflow: GeneratedWorkflow | null
  testResults: TestResult[] | null
  canApply: boolean
  isCompleted: boolean
  isTesting: boolean
  sendMessage: (text: string) => Promise<void>
  /** Replace a user message and regenerate the conversation from that point. */
  editMessage: (index: number, newText: string) => Promise<void>
  /** Remove a single message from the thread. */
  deleteMessage: (index: number) => void
  reset: () => void
}

// ── localStorage helpers ──────────────────────────────────

const STORAGE_KEY = 'aivory_copilot_state'

interface PersistedCopilotState {
  messages: CopilotMessage[]
  sessionId: string | null
  serverState: CopilotConversationState | null
  savedAt: string
}

function loadPersistedState(): PersistedCopilotState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PersistedCopilotState
  } catch {
    return null
  }
}

function savePersistedState(state: PersistedCopilotState) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch { /* quota exceeded — ignore */ }
}

function clearPersistedState() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}

// ── Hook ──────────────────────────────────────────────────

export function useWorkflowCopilot(): UseWorkflowCopilotReturn {
  // Load initial state from localStorage
  const initial = useRef(loadPersistedState())

  const [messages, setMessages] = useState<CopilotMessage[]>(initial.current?.messages ?? [])
  const [loading, setLoading] = useState(false)
  const [loadingHint, setLoadingHint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [serverState, setServerState] = useState<CopilotConversationState | null>(
    initial.current?.serverState ?? null
  )
  const [sessionId, setSessionId] = useState<string | null>(
    initial.current?.sessionId ?? null
  )

  // Derived convenience fields surfaced from server state.
  // Rehydrated from the persisted serverState using the same rules as the
  // copilot API route — otherwise a reload would drop workflow/canApply and
  // the "Apply to canvas" button would vanish for a ready workflow.
  const persisted = initial.current?.serverState ?? null
  const [workflow, setWorkflow] = useState<GeneratedWorkflow | null>(persisted?.generatedWorkflow ?? null)
  const [testResults, setTestResults] = useState<TestResult[] | null>(persisted?.testResults ?? null)
  const [canApply, setCanApply] = useState(persisted?.stage === 'AWAITING_APPLY_APPROVAL')
  const [isCompleted, setIsCompleted] = useState(persisted?.stage === 'COMPLETED')
  const [isTesting, setIsTesting] = useState(persisted?.stage === 'SANDBOX_TESTING' || persisted?.stage === 'FIXING')

  const stage = serverState?.stage ?? 'IDLE'

  // Persist messages + serverState to localStorage whenever they change
  useEffect(() => {
    savePersistedState({
      messages,
      sessionId,
      serverState,
      savedAt: new Date().toISOString(),
    })
  }, [messages, sessionId, serverState])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    setError(null)
    setLoadingHint(null)
    setMessages(prev => [...prev, { role: 'user', content: trimmed }])
    setLoading(true)

    // Progressive loading hints — shown after 5s and 30s so the user knows
    // Zeroclaw is still working rather than the request being stuck.
    const hint5  = setTimeout(() => setLoadingHint('Aivory is thinking...'), 5_000)
    const hint30 = setTimeout(() => setLoadingHint('Almost there — this can take up to 2 minutes'), 30_000)

    try {
      const response: CopilotApiResponse = await sendCopilotMessage({
        prompt: trimmed,
        sessionId,
        currentState: serverState,
      })

      // Persist state for next round
      setSessionId(response.sessionId)
      setServerState(response.currentState)

      // Update derived fields
      setWorkflow(response.workflow)
      setTestResults(response.testResults)
      setCanApply(response.canApply)
      setIsCompleted(response.isCompleted)
      setIsTesting(response.isTesting)

      // Add assistant reply to chat
      if (response.message) {
        setMessages(prev => [...prev, { role: 'assistant', content: response.message }])
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      setError(msg)
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${msg}` }])
    } finally {
      clearTimeout(hint5)
      clearTimeout(hint30)
      setLoading(false)
      setLoadingHint(null)
    }
  }, [loading, sessionId, serverState])

  const editMessage = useCallback(async (index: number, newText: string) => {
    const trimmed = newText.trim()
    if (!trimmed || loading) return
    // Drop the edited message and everything after it, then resend — the
    // conversation regenerates from that point (sendMessage re-appends the user turn).
    setMessages(prev => prev.slice(0, index))
    await sendMessage(trimmed)
  }, [loading, sendMessage])

  const deleteMessage = useCallback((index: number) => {
    setMessages(prev => prev.filter((_, i) => i !== index))
  }, [])

  const reset = useCallback(() => {
    setMessages([])
    setLoading(false)
    setLoadingHint(null)
    setError(null)
    setServerState(null)
    setSessionId(null)
    setWorkflow(null)
    setTestResults(null)
    setCanApply(false)
    setIsCompleted(false)
    setIsTesting(false)
    clearPersistedState()
  }, [])

  return {
    messages,
    loading,
    loadingHint,
    error,
    stage,
    workflow,
    testResults,
    canApply,
    isCompleted,
    isTesting,
    sendMessage,
    editMessage,
    deleteMessage,
    reset,
  }
}
