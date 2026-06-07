/**
 * Chat Session Persistence Module
 *
 * Persists chat messages per session to localStorage so they survive
 * page refreshes and session switches.
 */

// Local Message type to avoid circular imports with console page
export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  isStreaming?: boolean
}

export interface PersistedSession {
  id: string              // UUID session ID
  title: string           // Auto-generated from first user message (max 50 chars)
  messages: Message[]     // Full message history
  createdAt: number       // Unix timestamp
  updatedAt: number       // Unix timestamp of last message
}

export class ChatStorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ChatStorageError"
  }
}

const SESSIONS_KEY = "aira_chat_sessions"

/**
 * Load all persisted sessions from localStorage.
 * Returns empty array on JSON parse errors or missing data.
 */
function loadAllSessions(): PersistedSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * Save the sessions array to localStorage.
 * Throws ChatStorageError on QuotaExceededError.
 * Returns false if quota exceeded, true on success.
 */
function persistSessions(sessions: PersistedSession[]): boolean {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
    return true
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      throw new ChatStorageError("Chat history storage is full")
    }
    throw err
  }
}

/**
 * Save messages for a given session ID.
 * Auto-generates title from first user message (max 50 chars).
 * Updates `updatedAt` timestamp.
 * Throws ChatStorageError if localStorage quota is exceeded.
 */
export function saveSessionMessages(sessionId: string, messages: Message[]): boolean {
  const sessions = loadAllSessions()
  const existing = sessions.find(s => s.id === sessionId)

  const title =
    messages.find(m => m.role === "user")?.content.slice(0, 50) || "New chat"

  if (existing) {
    existing.messages = messages
    existing.updatedAt = Date.now()
    if (existing.title === "New chat" && title !== "New chat") {
      existing.title = title
    }
  } else {
    sessions.unshift({
      id: sessionId,
      title,
      messages,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  }

  return persistSessions(sessions)
}

/**
 * Load messages for a given session ID.
 * Returns empty array if session not found or on parse error.
 */
export function loadSessionMessages(sessionId: string): Message[] {
  const sessions = loadAllSessions()
  return sessions.find(s => s.id === sessionId)?.messages || []
}

/**
 * List all persisted sessions sorted by `updatedAt` descending (most recent first).
 */
export function listSessions(): PersistedSession[] {
  const sessions = loadAllSessions()
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Delete a single session by ID without affecting others.
 */
export function deleteSession(sessionId: string): void {
  const sessions = loadAllSessions()
  const filtered = sessions.filter(s => s.id !== sessionId)
  persistSessions(filtered)
}

/**
 * Update the title of an existing session.
 * No-op if session not found.
 */
export function updateSessionTitle(sessionId: string, title: string): void {
  const sessions = loadAllSessions()
  const session = sessions.find(s => s.id === sessionId)
  if (session) {
    session.title = title
    persistSessions(sessions)
  }
}
