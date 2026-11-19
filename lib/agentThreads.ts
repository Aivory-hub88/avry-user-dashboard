/**
 * Which thread opens when the user clicks an agent in the column.
 *
 * `sessionsByAgent` lists a thread under every agent that has a bubble in it,
 * so Room and Console threads show up under each agent that spoke there. The
 * row click must open a thread that is actually *owned* by that agent
 * (session-level agentType); opening a shared thread would restore its owner
 * (Console) as the target and the message would never reach the agent clicked.
 */
export function pickDirectThread<T extends { id: string; agentType?: string | null }>(
  threads: T[],
  agentType: string | null,
  /** The group Room's session. It carries no session-level agentType (it is
   *  multi-agent), so without this the Aivory Console row (null) matched it
   *  and a click on the Aivory icon opened the Room instead of a normal chat. */
  excludeId?: string | null,
): T | undefined {
  return threads.find((t) => t.id !== excludeId && (t.agentType ?? null) === agentType)
}
