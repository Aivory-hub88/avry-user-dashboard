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

import { useState, useCallback, useEffect } from 'react'
import {
  sendCopilotMessage,
  type CopilotApiResponse,
  type CopilotConversationState,
  type GeneratedWorkflow,
  type TestResult,
} from '@/lib/workflows/copilotClient'
import { typewriterStream } from '@/lib/streaming'
import type { StreamChunk } from '@/types/console'

export interface CopilotMessage {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

export interface UseWorkflowCopilotReturn {
  messages: CopilotMessage[]
  loading: boolean
  loadingHint: string | null   // progressive hint: null → "working..." → "still working..."
  isStreamingReply: boolean    // true while the last assistant message is being typed out
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

// The copilot's backend reply arrives as one blocking JSON response (it also
// carries workflow/testResults/stage, which can't be known until the whole
// state-machine turn completes) — there's no token-by-token SSE to relay.
// Reuse the console chat's own typewriterStream() to replay the finished
// text at the same pace, so the two chat surfaces read identically.
async function* singleTextSource(text: string): AsyncGenerator<StreamChunk> {
  yield { type: 'chunk', content: text }
}

async function streamAssistantMessage(
  fullText: string,
  setMessages: React.Dispatch<React.SetStateAction<CopilotMessage[]>>,
  setIsStreamingReply: (v: boolean) => void,
) {
  setIsStreamingReply(true)
  setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }])

  // Locate by the isStreaming flag rather than assuming "last message" —
  // the user can delete the in-progress bubble mid-animation, and blindly
  // overwriting whatever is now last would corrupt an unrelated message.
  const applyToStreamingMessage = (patch: Partial<CopilotMessage>) => {
    setMessages(prev => {
      const idx = prev.findIndex(m => m.isStreaming)
      if (idx === -1) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      return next
    })
  }

  try {
    for await (const chunk of typewriterStream(singleTextSource(fullText))) {
      if (chunk.type === 'chunk' && typeof chunk.content === 'string') {
        applyToStreamingMessage({ content: chunk.content, isStreaming: true })
      }
    }
  } finally {
    applyToStreamingMessage({ content: fullText, isStreaming: false })
    setIsStreamingReply(false)
  }
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
  // Load initial state from localStorage. Each useState below uses the
  // lazy-initializer function form (`() => ...`) rather than a shared
  // useRef — that form is guaranteed to run exactly once, on mount, so
  // there's no need to read a ref's `.current` during render (unsafe under
  // concurrent rendering) to avoid recomputing on every re-render. The
  // handful of extra loadPersistedState() calls only happen once, at mount.
  const [messages, setMessages] = useState<CopilotMessage[]>(() => loadPersistedState()?.messages ?? [])
  const [loading, setLoading] = useState(false)
  const [loadingHint, setLoadingHint] = useState<string | null>(null)
  const [isStreamingReply, setIsStreamingReply] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [serverState, setServerState] = useState<CopilotConversationState | null>(
    () => loadPersistedState()?.serverState ?? null
  )
  const [sessionId, setSessionId] = useState<string | null>(
    () => loadPersistedState()?.sessionId ?? null
  )

  // Derived convenience fields surfaced from server state.
  // Rehydrated from the persisted serverState using the same rules as the
  // copilot API route — otherwise a reload would drop workflow/canApply and
  // the "Apply to canvas" button would vanish for a ready workflow.
  const [workflow, setWorkflow] = useState<GeneratedWorkflow | null>(() => loadPersistedState()?.serverState?.generatedWorkflow ?? null)
  const [testResults, setTestResults] = useState<TestResult[] | null>(() => loadPersistedState()?.serverState?.testResults ?? null)
  const [canApply, setCanApply] = useState(() => loadPersistedState()?.serverState?.stage === 'AWAITING_APPLY_APPROVAL')
  const [isCompleted, setIsCompleted] = useState(() => loadPersistedState()?.serverState?.stage === 'COMPLETED')
  const [isTesting, setIsTesting] = useState(() => {
    const s = loadPersistedState()?.serverState?.stage
    return s === 'SANDBOX_TESTING' || s === 'FIXING'
  })

  const stage = serverState?.stage ?? 'IDLE'

  // Persist messages + serverState to localStorage whenever they change.
  // Skipped mid-typewriter: the animation updates `messages` every ~40ms,
  // and writing to localStorage on every tick is pure overhead — the final
  // tick (isStreamingReply flips back to false) always persists the finished text.
  useEffect(() => {
    if (isStreamingReply) return
    savePersistedState({
      messages,
      sessionId,
      serverState,
      savedAt: new Date().toISOString(),
    })
  }, [messages, sessionId, serverState, isStreamingReply])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading || isStreamingReply) return

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

      // The network round-trip is done — stop the "thinking" indicator and,
      // if there's a reply, type it out the same way the AI console does.
      clearTimeout(hint5)
      clearTimeout(hint30)
      setLoading(false)
      setLoadingHint(null)

      if (response.message) {
        await streamAssistantMessage(response.message, setMessages, setIsStreamingReply)
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
  }, [loading, isStreamingReply, sessionId, serverState])

  const editMessage = useCallback(async (index: number, newText: string) => {
    const trimmed = newText.trim()
    if (!trimmed || loading || isStreamingReply) return
    // Drop the edited message and everything after it, then resend — the
    // conversation regenerates from that point (sendMessage re-appends the user turn).
    setMessages(prev => prev.slice(0, index))
    await sendMessage(trimmed)
  }, [loading, isStreamingReply, sendMessage])

  const deleteMessage = useCallback((index: number) => {
    setMessages(prev => prev.filter((_, i) => i !== index))
  }, [])

  const reset = useCallback(() => {
    setMessages([])
    setLoading(false)
    setLoadingHint(null)
    setIsStreamingReply(false)
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
    isStreamingReply,
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
