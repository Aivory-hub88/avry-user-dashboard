/**
 * Which thread opens when the user clicks an agent in the column, and which
 * threads belong to the group Room.
 *
 * `sessionsByAgent` lists a thread under every agent that has a bubble in it,
 * so Room and Console threads show up under each agent that spoke there. The
 * row click must open a thread that is actually *owned* by that agent
 * (session-level agentType); opening a shared thread would restore its owner
 * (Console) as the target and the message would never reach the agent clicked.
 */

interface ThreadLike {
  id: string
  agentType?: string | null
  messages?: { role?: string; agentType?: string | null }[]
}

/**
 * A group-Room thread: the current Room session, or any thread with no
 * session-level agentType whose agent bubbles carry their own attribution
 * (only multi-agent threads do). Old Room threads are not the current
 * `roomSessionId`, so the attribution is what identifies them.
 */
export function isRoomThread(t: ThreadLike, roomSessionId?: string | null): boolean {
  if (roomSessionId && t.id === roomSessionId) return true
  if ((t.agentType ?? null) !== null) return false
  return !!t.messages?.some((m) => m.role === "assistant" && !!m.agentType)
}

export function pickDirectThread<T extends ThreadLike>(
  threads: T[],
  agentType: string | null,
  /** The group Room's session. Room threads are never Direct threads: without
   *  this the Aivory Console row (null) matched them. */
  roomSessionId?: string | null,
): T | undefined {
  return threads.find((t) => !isRoomThread(t, roomSessionId) && (t.agentType ?? null) === agentType)
}
