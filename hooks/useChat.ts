'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { getSessionId, clearSession, generateSessionId, saveSession } from '@/lib/session'
import { streamConsoleResponse, typewriterStream } from '@/lib/streaming'
import { saveSessionMessages, loadSessionMessages, listSessions, getSession, deleteSession, ChatStorageError } from '@/lib/chatPersistence'
import { normalizeAssistantText } from '@/lib/normalizeAssistantText'
import { parseLLMResponse } from '@/lib/parseLLMResponse'
import { buildUserContextState, formatUserContextForAI } from "@/lib/userContextState"
import { sendAgentMessage, type ConsolePendingApproval } from '@/lib/agentChat'
import { resolveApproval } from '@/lib/agentApprovals'
import type { TelegramAgentType } from '@/lib/telegramDeploy'
import { useMode } from '@/contexts/ModeContext'
import { useSession } from './useSession'
import type { Attachment } from '@/components/UploadMenu'

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  isStreaming?: boolean
  attachments?: Attachment[]
  pendingApproval?: ConsolePendingApproval | null
  /** Set once the user acts on pendingApproval — hides the buttons, no re-resolve. */
  approvalOutcome?: 'approved' | 'denied' | null
  approvalBusy?: boolean
}
export interface ChatSession { id: string; title: string; messages: Message[]; createdAt: number; updatedAt: number; pinned?: boolean; agentType: string | null }

const DEFAULT_SUGGESTIONS = [
  "Can you elaborate on that?",
  "Show me an example",
  "What are the tradeoffs?",
]

interface UseChatParams {
  attachments: Attachment[]
  clearAttachments: () => void
  processEvent: (event: any) => void
  resetAgentic: () => void
  triggerClassification: (userText: string, assistantText: string) => void
  addToast: (type: "error" | "success", msg: string) => void
}

export function useChat({
  attachments,
  clearAttachments,
  processEvent,
  resetAgentic,
  triggerClassification,
  addToast,
}: UseChatParams) {
  const [messages, setMessages] = useState<Message[]>([])
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string>("")
  const [isStreaming, setIsStreaming] = useState(false)
  // Which agent a reply is actually coming from — captured at send time, so
  // it stays correct even if the user switches to a different agent while
  // this one is still answering (agentTarget itself would have moved on).
  // undefined = nothing streaming; null = Aivory Console itself is streaming
  // (its own agentType) — kept distinct so a finished reply can't be
  // mistaken for Console being busy, since both would otherwise read null.
  const [streamingAgentType, setStreamingAgentType] = useState<string | null | undefined>(undefined)
  const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([])
  const [isClarification, setIsClarification] = useState(false)
  const messagesRef = useRef<Message[]>([])
  const currentSessionIdRef = useRef<string>("")
  const session = useSession(addToast)
  const { agentTarget, setAgentTarget } = useMode()

  // Keep ref in sync with state so handleSend can read current messages without stale closure
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Lets a reply that resolves after the user has switched threads detect
  // that it's no longer the one on screen — see handleSend's finally blocks.
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId
  }, [currentSessionId])

  // Session init
  useEffect(() => {
    const sid = getSessionId() || generateSessionId()
    saveSession(sid)
    // Standard fetch-on-mount / sync-from-prop / hydrate-after-mount pattern
    // (functionally correct in this pre-Suspense/pre-React-Query codebase) —
    // not restructuring this component's data flow to satisfy the newer
    // React Compiler style rule; see other documented instances of this.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentSessionId(sid)
    const restored = loadSessionMessages(sid)
    if (restored.length > 0) setMessages(restored)
    // Restore which agent this thread belongs to — otherwise a refresh
    // always lands back on the Generalist regardless of what was selected.
    setAgentTarget(getSession(sid)?.agentType ?? null)
    setSessions(listSessions())
    // Only ever runs once, on mount — setAgentTarget is stable from context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSend = useCallback(async (text: string, atts: Attachment[]) => {
    if (!text.trim() && atts.length === 0) return
    setFollowUpSuggestions([])
    setIsClarification(false)

    const imageAtts = atts.filter(a => a.content?.startsWith('data:image/'))
    const textAtts = atts.filter(a => a.content && !a.content.startsWith('data:image/'))
    const attachmentText = [
      ...textAtts.map(a => `[Attached file: ${a.filename}]\n${a.content}`),
      ...imageAtts.map(a => `[Attached image: ${a.filename} — image preview shown above]`),
    ].join('\n\n')
    const userContent = attachmentText ? `${text}\n\n${attachmentText}` : text

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: userContent, attachments: atts.length > 0 ? atts : undefined }
    const assistantId = (Date.now() + 1).toString()
    const placeholderMsg: Message = { id: assistantId, role: "assistant", content: "", isStreaming: true }

    const allMessages = [...messagesRef.current, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }))

    // This request belongs to whichever thread/agent is active right now —
    // captured once, so a later switch can't make the reply land somewhere
    // else. `sentMessagesSnapshot` is this thread's own history plus the
    // placeholder, independent of whatever `messages`/`currentSessionId`
    // become after the user navigates away while this is still in flight.
    const sentSessionId = currentSessionId
    const sentAgentTarget = agentTarget
    const sentMessagesSnapshot = [...messagesRef.current, userMsg, placeholderMsg]

    setMessages(p => [...p, userMsg, placeholderMsg])
    clearAttachments()
    setIsStreaming(true)
    setStreamingAgentType(agentTarget)
    setFollowUpSuggestions([])
    setIsClarification(false)

    let finalContent = ""
    let streamError = false

    // Deployable-agent chat: single JSON reply (the agent may run tools
    // before answering), no SSE stream — the placeholder keeps the typing UI.
    if (agentTarget) {
      let pendingApproval: ConsolePendingApproval | null = null
      try {
        const result = await sendAgentMessage(
          sentAgentTarget as TelegramAgentType,
          userContent,
          sentSessionId
        )
        finalContent = result.reply
        pendingApproval = result.pendingApproval
        // Only touch the live thread if it's still the one on screen — if
        // the user switched away, this would otherwise patch whatever
        // thread they're now looking at instead of the one that answered.
        if (currentSessionIdRef.current === sentSessionId) {
          setMessages(p => p.map(m => m.id === assistantId ? { ...m, content: finalContent, isStreaming: false, pendingApproval } : m))
        }
      } catch (error) {
        addToast("error", error instanceof Error ? error.message : "Agent is unavailable right now.")
        if (currentSessionIdRef.current === sentSessionId) {
          setMessages(p => p.filter(m => m.id !== assistantId))
        }
        streamError = true
      } finally {
        setIsStreaming(false)
        setStreamingAgentType(undefined)
        if (!streamError) {
          try {
            if (currentSessionIdRef.current === sentSessionId) {
              setMessages(prev => {
                const updated = prev.map(m =>
                  m.id === assistantId ? { ...m, content: finalContent, isStreaming: false, pendingApproval } : m
                )
                saveSessionMessages(sentSessionId, updated, sentAgentTarget)
                setSessions(listSessions())
                return updated
              })
            } else {
              // Viewing something else now — persist this thread's own
              // correct history directly, without touching what's on screen.
              const finalList = sentMessagesSnapshot.map(m =>
                m.id === assistantId ? { ...m, content: finalContent, isStreaming: false, pendingApproval } : m
              )
              saveSessionMessages(sentSessionId, finalList, sentAgentTarget)
              setSessions(listSessions())
            }
          } catch (e) {
            if (e instanceof ChatStorageError) {
              addToast("error", "Chat history storage is full. Messages may not be saved.")
            }
          }
        }
      }
      return
    }

    try {
      const baseStream = streamConsoleResponse("/api/console/stream", {
        session_id: sentSessionId,
        organization_id: "default",
        messages: allMessages,
        user_state: formatUserContextForAI(buildUserContextState()),
      })
      const stream = typewriterStream(baseStream)
      for await (const chunk of stream) {
        processEvent(chunk as any)
        if (chunk.type === "chunk" && chunk.content) {
          finalContent = chunk.content
          // Don't paint chunks into whatever thread happens to be open —
          // only the thread this stream actually belongs to.
          if (currentSessionIdRef.current === sentSessionId) {
            setMessages(p => p.map(m => m.id === assistantId ? { ...m, content: finalContent } : m))
          }
        } else if (chunk.type === "done") {
          const normalized = normalizeAssistantText(finalContent)
          const parsed = parseLLMResponse(normalized)
          finalContent = parsed.reply
          setFollowUpSuggestions(parsed.suggestions)
          setIsClarification(parsed.isClarification)
          console.log('[useChat] triggerClassification called with text:', text.slice(0, 100), '| parsed.reply:', parsed.reply.slice(0, 100))
          triggerClassification(text, parsed.reply)
        } else if (chunk.type === "error") {
          addToast("error", chunk.error || "Something went wrong.")
          if (currentSessionIdRef.current === sentSessionId) {
            setMessages(p => p.filter(m => m.id !== assistantId))
          }
          streamError = true
          break
        }
      }
    } catch (error) {
      addToast("error", "Something went wrong. Please try again.")
      if (currentSessionIdRef.current === sentSessionId) {
        setMessages(p => p.filter(m => m.id !== assistantId))
      }
      streamError = true
    } finally {
      setIsStreaming(false)
      setStreamingAgentType(undefined)
      if (!streamError) {
        try {
          if (currentSessionIdRef.current === sentSessionId) {
            setMessages(prev => {
              const updated = prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: finalContent, isStreaming: false }
                  : m
              )
              saveSessionMessages(sentSessionId, updated, sentAgentTarget)
              setSessions(listSessions())
              return updated
            })
          } else {
            const finalList = sentMessagesSnapshot.map(m =>
              m.id === assistantId ? { ...m, content: finalContent, isStreaming: false } : m
            )
            saveSessionMessages(sentSessionId, finalList, sentAgentTarget)
            setSessions(listSessions())
          }
        } catch (e) {
          if (e instanceof ChatStorageError) {
            addToast("error", "Chat history storage is full. Messages may not be saved.")
          }
        }
      }
    }
  }, [currentSessionId, agentTarget, addToast, processEvent, triggerClassification, clearAttachments])

  // Resolves a pending F-1 approval surfaced inline in the console, reusing
  // the same /api/v1/agent-approvals endpoint the dashboard Approvals page
  // calls. On success, Cerveau's durable-resume continuation (if any) is
  // appended as a new assistant message — same as approving from the
  // dashboard resumes the original conversation there.
  const resolveConsoleApproval = useCallback(async (messageId: string, decision: 'approve' | 'deny') => {
    const target = messagesRef.current.find(m => m.id === messageId)
    const approval = target?.pendingApproval
    if (!approval) return

    setMessages(p => p.map(m => m.id === messageId ? { ...m, approvalBusy: true } : m))
    try {
      const result = await resolveApproval(
        { id: approval.id, _agent_type: agentTarget ?? undefined },
        decision,
      )
      const outcome: 'approved' | 'denied' = decision === 'approve' ? 'approved' : 'denied'
      setMessages(prev => {
        let updated = prev.map(m =>
          m.id === messageId
            ? { ...m, approvalBusy: false, approvalOutcome: outcome }
            : m
        )
        if (result.reply) {
          updated = [
            ...updated,
            { id: (Date.now() + 2).toString(), role: 'assistant' as const, content: result.reply },
          ]
        }
        saveSessionMessages(currentSessionId, updated, agentTarget)
        setSessions(listSessions())
        return updated
      })
    } catch (error) {
      setMessages(p => p.map(m => m.id === messageId ? { ...m, approvalBusy: false } : m))
      addToast("error", error instanceof Error ? error.message : "Failed to resolve approval.")
    }
  }, [agentTarget, currentSessionId, addToast])

  const handleNewChat = useCallback(() => {
    if (messages.length > 0) {
      session.save(currentSessionId, messages, agentTarget)
    }
    clearSession()
    const sid = generateSessionId()
    saveSession(sid)
    setCurrentSessionId(sid)
    setMessages([])
    clearAttachments()
    resetAgentic()
    setSessions(listSessions())
  }, [currentSessionId, messages, session, agentTarget, resetAgentic, clearAttachments])

  const switchSession = useCallback((targetSessionId: string) => {
    if (targetSessionId === currentSessionId) return
    if (messages.length > 0) {
      session.save(currentSessionId, messages, agentTarget)
    }
    const loaded = session.load(targetSessionId)
    setMessages(loaded)
    setCurrentSessionId(targetSessionId)
    // A thread keeps the agent it was started under — restore it so the
    // next message doesn't silently go to whatever was selected before.
    setAgentTarget(session.getAgentType(targetSessionId))
    setSessions(listSessions())
  }, [currentSessionId, messages, session, agentTarget, setAgentTarget])

  // Deletes a thread outright. If it's the one currently open, start a
  // fresh empty thread under the same agent rather than leaving the view
  // pointed at a session that no longer exists.
  const deleteThread = useCallback((sessionId: string) => {
    deleteSession(sessionId)
    if (sessionId === currentSessionId) {
      clearSession()
      const sid = generateSessionId()
      saveSession(sid)
      setCurrentSessionId(sid)
      setMessages([])
      resetAgentic()
    }
    setSessions(listSessions())
  }, [currentSessionId, resetAgentic])

  // Threads nested under the agent that held them — one entry per agentType,
  // 'null' (Aivory Console) included. Sessions are already updatedAt-desc
  // from listSessions(), so each group stays most-recent-first too.
  const sessionsByAgent = sessions.reduce<Record<string, ChatSession[]>>((acc, s) => {
    const key = s.agentType ?? 'null'
    ;(acc[key] ??= []).push(s)
    return acc
  }, {})

  return {
    messages,
    sessions,
    sessionsByAgent,
    currentSessionId,
    isStreaming,
    streamingAgentType,
    followUpSuggestions,
    setFollowUpSuggestions,
    isClarification,
    handleSend,
    resolveConsoleApproval,
    handleNewChat,
    switchSession,
    deleteThread,
  }
}
