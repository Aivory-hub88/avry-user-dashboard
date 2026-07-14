/**
 * useNodeConfigCopilot Hook
 *
 * Turns a natural-language intent into a concrete NodeConfig for one node,
 * via /api/workflows/aivory-configure. Used by the "Setup with Aivory" panel.
 */

import { useCallback, useState } from 'react'
import type { NodeConfig } from '@/types/workflow-node'
import { BASE_PATH } from '@/lib/asset'

export interface ConfigCopilotResult {
  config: NodeConfig
  summary: string
}

export function useNodeConfigCopilot() {
  const [result, setResult] = useState<ConfigCopilotResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const askConfigure = useCallback(
    async (args: { nodeTitle: string; currentConfig: NodeConfig; intent: string; workflow?: any }) => {
      if (!args.intent.trim()) {
        setError('Describe how this node should be configured')
        return
      }
      setLoading(true)
      setError(null)
      setResult(null)
      try {
        // basePath-aware: Next serves API routes under /dashboard/api/...
        const res = await fetch(`${BASE_PATH}/api/workflows/aivory-configure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodeTitle: args.nodeTitle,
            nodeType: args.currentConfig.type,
            currentConfig: args.currentConfig,
            intent: args.intent.trim(),
            workflow: args.workflow ?? undefined,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(data?.error || `HTTP ${res.status}`)
          return
        }
        setResult({ config: data.config as NodeConfig, summary: data.summary ?? 'Configuration updated' })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to configure node')
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const clear = useCallback(() => { setResult(null); setError(null) }, [])

  return { result, loading, error, askConfigure, clear }
}
