'use client'
/**
 * Which Agent Team (ADR-020) the Console Room is scoped to. The pick is a
 * per-browser convenience (localStorage); a stored id whose team no longer
 * exists is ignored, so deleting a team can never leave the Room stuck on it.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  createAgentTeam,
  deleteAgentTeam,
  listAgentTeams,
  updateAgentTeam,
  type AgentTeam,
} from '@/lib/agentTeams'

const KEY = 'aivory.console.roomTeam'

function readStored(): string | null {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function writeStored(id: string | null) {
  try {
    if (id) window.localStorage.setItem(KEY, id)
    else window.localStorage.removeItem(KEY)
  } catch {
    // storage blocked: the pick just won't survive a reload
  }
}

export function useRoomTeam() {
  const [teams, setTeams] = useState<AgentTeam[]>([])
  const [pickedId, setPickedId] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    // Fetch on mount; state is only set after the awaits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPickedId(readStored())
    listAgentTeams()
      .then((t) => live && setTeams(t))
      .catch(() => {}) // no teams = the picker simply doesn't appear
    return () => {
      live = false
    }
  }, [])

  const team = teams.find((t) => t.id === pickedId) ?? null

  const setTeamId = useCallback((id: string | null) => {
    setPickedId(id)
    writeStored(id)
  }, [])

  /** Create a group from the Room and switch the Room to it. Throws the backend's message on failure. */
  const createGroup = useCallback(
    async (name: string, agentTypes: string[]) => {
      const created = await createAgentTeam({ name, agent_types: agentTypes })
      setTeams((cur) => [...cur, created])
      setTeamId(created.id)
      return created
    },
    [setTeamId],
  )

  const saveGroup = useCallback(async (id: string, name: string, agentTypes: string[]) => {
    const saved = await updateAgentTeam(id, { name, agent_types: agentTypes })
    setTeams((cur) => cur.map((t) => (t.id === id ? saved : t)))
    return saved
  }, [])

  const removeGroup = useCallback(
    async (id: string) => {
      await deleteAgentTeam(id)
      setTeams((cur) => cur.filter((t) => t.id !== id))
      setPickedId((cur) => {
        if (cur === id) writeStored(null)
        return cur === id ? null : cur
      })
    },
    [],
  )

  return { teams, team, teamId: team?.id ?? null, setTeamId, createGroup, saveGroup, removeGroup }
}
