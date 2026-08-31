'use client'
/**
 * Shared, single fetch for where each agent is deployed (Telegram bindings,
 * Slack installations, API keys). Was fetched independently in AgentColumn
 * and AgentRail — now one source, since AgentDeployNotice needs it too and
 * three independent fetches of the same data is exactly the kind of drift
 * this project has been correcting elsewhere (see useAgentApprovals).
 */
import { useEffect, useState } from 'react'
import { listDeployments, type AgentDeployment } from '@/lib/agentChat'

export function useAgentDeployments() {
  const [deployments, setDeployments] = useState<AgentDeployment[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    listDeployments()
      .then(setDeployments)
      .catch(() => setDeployments([]))
      .finally(() => setLoaded(true))
  }, [])

  return { deployments, loaded }
}
