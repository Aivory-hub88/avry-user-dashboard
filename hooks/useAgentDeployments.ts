'use client'
/**
 * Shared, single fetch for where each agent is deployed (Telegram bindings,
 * Slack installations, API keys), plus the built-in Console + Workspace
 * deployment every agent always has. Was fetched independently in AgentColumn
 * and AgentRail — now one source, since AgentDeployNotice needs it too and
 * three independent fetches of the same data is exactly the kind of drift
 * this project has been correcting elsewhere (see useAgentApprovals).
 */
import { useEffect, useState } from 'react'
import { listDeployments, withConsoleDeployments, type AgentDeployment } from '@/lib/agentChat'

export function useAgentDeployments() {
  // Console + Workspace is built in for every agent, so it is present even
  // before (or without) the external-channel fetch resolving.
  const [deployments, setDeployments] = useState<AgentDeployment[]>(() => withConsoleDeployments([]))
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    listDeployments()
      .then((d) => setDeployments(withConsoleDeployments(d)))
      .catch(() => setDeployments(withConsoleDeployments([])))
      .finally(() => setLoaded(true))
  }, [])

  return { deployments, loaded }
}
