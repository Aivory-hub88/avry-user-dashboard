'use client'
import { useCallback } from 'react'
import { saveSessionMessages as _save, loadSessionMessages as _load, listSessions as _list, getSession as _getSession, ChatStorageError } from '@/lib/chatPersistence'

interface Message { id: string; role: "user" | "assistant"; content: string; isStreaming?: boolean }

export function useSession(addToast: (type: "error" | "success", msg: string) => void) {
  const save = useCallback((sessionId: string, messages: Message[], agentType: string | null = null) => {
    try {
      _save(sessionId, messages, agentType)
    } catch (e) {
      if (e instanceof ChatStorageError) {
        addToast("error", "Chat history storage is full. Messages may not be saved.")
      }
    }
  }, [addToast])

  const load = useCallback((sessionId: string): Message[] => {
    return _load(sessionId)
  }, [])

  const list = useCallback(() => {
    return _list()
  }, [])

  const getAgentType = useCallback((sessionId: string): string | null => {
    return _getSession(sessionId)?.agentType ?? null
  }, [])

  return { save, load, list, getAgentType }
}
