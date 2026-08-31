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
  /** Prebuilt-agent type this thread belongs to; null = Aivory Console (Generalist). */
  agentType: string | null
}

export class ChatStorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ChatStorageError"
  }
}

const SESSIONS_KEY = "aivory_chat_sessions"

/**
 * Load all persisted sessions from localStorage.
 * Returns empty array on JSON parse errors or missing data.
 */
function loadAllSessions(): PersistedSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    // Migration: sessions persisted before agentType existed get null,
    // meaning Aivory Console (Generalist) — same brain they were on.
    return parsed.map((s: Omit<PersistedSession, 'agentType'> & { agentType?: string | null }) => ({
      ...s,
      agentType: s.agentType ?? null,
    }))
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
 * `agentType` stamps which agent this thread belongs to — only applied the
 * first time a session is created; an existing session keeps the agent it
 * started with even if the caller's current agent selection has moved on.
 * Throws ChatStorageError if localStorage quota is exceeded.
 */
export function saveSessionMessages(
  sessionId: string,
  messages: Message[],
  agentType: string | null = null,
): boolean {
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
      agentType,
    })
  }

  return persistSessions(sessions)
}

/**
 * Look up a single persisted session, agentType included.
 * Used to restore which agent a thread belongs to when it's reopened.
 */
export function getSession(sessionId: string): PersistedSession | undefined {
  return loadAllSessions().find(s => s.id === sessionId)
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
