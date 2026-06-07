'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { getSessionId, clearSession, generateSessionId, saveSession } from '@/lib/session'
import { streamConsoleResponse, typewriterStream } from '@/lib/streaming'
import { saveSessionMessages, loadSessionMessages, listSessions, ChatStorageError } from '@/lib/chatPersistence'
import { normalizeAssistantText } from '@/lib/normalizeAssistantText'
import { parseLLMResponse } from '@/lib/parseLLMResponse'
import { useSession } from './useSession'
import type { Attachment } from '@/components/UploadMenu'

interface Message { id: string; role: "user" | "assistant"; content: string; isStreaming?: boolean; attachments?: Attachment[] }
interface ChatSession { id: string; title: string; messages: Message[]; createdAt: number; pinned?: boolean }

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
  const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([])
  const [isClarification, setIsClarification] = useState(false)
  const messagesRef = useRef<Message[]>([])
  const session = useSession(addToast)

  // Keep ref in sync with state so handleSend can read current messages without stale closure
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Session init
  useEffect(() => {
    const sid = getSessionId() || generateSessionId()
    saveSession(sid)
    setCurrentSessionId(sid)
    const restored = loadSessionMessages(sid)
    if (restored.length > 0) setMessages(restored)
    setSessions(listSessions())
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

    const allMessages = [...messagesRef.current, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }))

    setMessages(p => [
      ...p,
      userMsg,
      { id: assistantId, role: "assistant", content: "", isStreaming: true }
    ])
    clearAttachments()
    setIsStreaming(true)
    setFollowUpSuggestions([])
    setIsClarification(false)

    let finalContent = ""
    let streamError = false
    try {
      const baseStream = streamConsoleResponse("/api/console/stream", {
        session_id: currentSessionId,
        organization_id: "default",
        messages: allMessages,
      })
      const stream = typewriterStream(baseStream)
      for await (const chunk of stream) {
        processEvent(chunk as any)
        if (chunk.type === "chunk" && chunk.content) {
          finalContent = chunk.content
          setMessages(p => p.map(m => m.id === assistantId ? { ...m, content: finalContent } : m))
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
          setMessages(p => p.filter(m => m.id !== assistantId))
          streamError = true
          break
        }
      }
    } catch (error) {
      addToast("error", "Something went wrong. Please try again.")
      setMessages(p => p.filter(m => m.id !== assistantId))
      streamError = true
    } finally {
      setIsStreaming(false)
      if (!streamError) {
        try {
          setMessages(prev => {
            const updated = prev.map(m =>
              m.id === assistantId
                ? { ...m, content: finalContent, isStreaming: false }
                : m
            )
            saveSessionMessages(currentSessionId, updated)
            setSessions(listSessions())
            return updated
          })
        } catch (e) {
          if (e instanceof ChatStorageError) {
            addToast("error", "Chat history storage is full. Messages may not be saved.")
          }
        }
      }
    }
  }, [currentSessionId, addToast, processEvent, triggerClassification, clearAttachments])

  const handleNewChat = useCallback(() => {
    if (messages.length > 0) {
      session.save(currentSessionId, messages)
    }
    clearSession()
    const sid = generateSessionId()
    saveSession(sid)
    setCurrentSessionId(sid)
    setMessages([])
    clearAttachments()
    resetAgentic()
    setSessions(listSessions())
  }, [currentSessionId, messages, session, resetAgentic, clearAttachments])

  const switchSession = useCallback((targetSessionId: string) => {
    if (targetSessionId === currentSessionId) return
    if (messages.length > 0) {
      session.save(currentSessionId, messages)
    }
    const loaded = session.load(targetSessionId)
    setMessages(loaded)
    setCurrentSessionId(targetSessionId)
    setSessions(listSessions())
  }, [currentSessionId, messages, session])

  return {
    messages,
    sessions,
    currentSessionId,
    isStreaming,
    followUpSuggestions,
    setFollowUpSuggestions,
    isClarification,
    handleSend,
    handleNewChat,
    switchSession,
  }
}
