/**
 * Fire-and-forget logging of successfully deployed workflows into Aivory's
 * shared cognee-rs knowledge graph (the same sidecar AVRY-Cerveau and
 * vanilla zeroclaw both use — see
 * docs/ADR-007-CERVEAU-COGNEE-INTEGRATION.md §12/§13 in AVRY-V2-Main).
 *
 * Deliberately NOT wired into Workflow Copilot's clarify/generate calls
 * (`app/api/workflows/copilot/route.ts` -> vps-bridge's
 * `handleWorkflowClarifyDirect`/`handleWorkflowCopilotDirect`). Those paths
 * were moved off Zeroclaw specifically to shed tool-calling latency and
 * token-bloat reliability problems (documented at length in `server.js`
 * around `WORKFLOW_CLARIFY_INSTR`) -- adding a graph round-trip to that hot
 * streaming path would risk reintroducing exactly what was fixed. This only
 * fires once, after a deploy has already succeeded, and never blocks the
 * response: `route.ts` calls this and does not await ordering against it.
 */

const COGNEE_BASE_URL = (process.env.COGNEE_BASE_URL ?? 'http://host.docker.internal:3200').trim()
const COGNEE_INTERNAL_SECRET = (process.env.COGNEE_INTERNAL_SECRET ?? '').trim()
// Own identity, separate from vanilla zeroclaw's shared graph identity
// (`vanilla_shared`/`vanilla`) -- this is a different product surface with
// its own kind of institutional knowledge (which integrations/workflow
// shapes actually got deployed), not because it needs isolation from it.
const TENANT_ID = 'aivory_workflow_copilot'
const AGENT_TYPE = 'workflow_copilot'
const DATASET_NAME = 'workflow_copilot_graph'
const TIMEOUT_MS = 8_000

interface DeployedWorkflowSummary {
  workflowName: string
  steps: Array<{ app?: string; action?: string; title?: string }>
  n8nWorkflowId?: string
  instance: 'aivory' | 'byo'
}

function buildFactText(summary: DeployedWorkflowSummary): string {
  const apps = Array.from(
    new Set(summary.steps.map((s) => s.app).filter((a): a is string => Boolean(a))),
  )
  const stepLines = summary.steps
    .map((s, i) => `${i + 1}. ${s.title || s.action || s.app || 'step'}${s.app ? ` (${s.app})` : ''}`)
    .join('\n')
  return (
    `Workflow "${summary.workflowName}" was deployed to n8n` +
    (summary.n8nWorkflowId ? ` (id ${summary.n8nWorkflowId})` : '') +
    `, instance: ${summary.instance}.\n` +
    (apps.length ? `Integrations used: ${apps.join(', ')}.\n` : '') +
    `Steps:\n${stepLines}`
  )
}

/**
 * Fire-and-forget: never throws, never awaited by the caller for ordering.
 * `enabled` is false whenever `COGNEE_INTERNAL_SECRET` isn't configured --
 * treated as "feature off", not an error, since most environments (local
 * dev, a fresh deploy before the secret is provisioned) won't have it set.
 */
export function logWorkflowDeployed(summary: DeployedWorkflowSummary): void {
  if (!COGNEE_INTERNAL_SECRET) return

  const text = buildFactText(summary)
  const base = COGNEE_BASE_URL.replace(/\/$/, '')

  void (async () => {
    try {
      const headers = {
        'X-Tenant-Id': TENANT_ID,
        'X-Agent-Type': AGENT_TYPE,
        'X-Cerveau-Internal-Secret': COGNEE_INTERNAL_SECRET,
      }

      const form = new FormData()
      form.append('data', new Blob([text], { type: 'text/plain' }), 'fact.txt')
      form.append('datasetName', DATASET_NAME)

      const addRes = await fetch(`${base}/api/v1/add`, {
        method: 'POST',
        headers,
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!addRes.ok) {
        console.warn('[cogneeGraphLog] add failed', addRes.status, await addRes.text().catch(() => ''))
        return
      }

      const cognifyRes = await fetch(`${base}/api/v1/cognify`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasets: [DATASET_NAME], runInBackground: false }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!cognifyRes.ok) {
        console.warn(
          '[cogneeGraphLog] cognify failed',
          cognifyRes.status,
          await cognifyRes.text().catch(() => ''),
        )
      }
    } catch (err) {
      // Best-effort enrichment -- a deploy already succeeded by the time
      // this runs, so any failure here (sidecar down, network hiccup) is a
      // warning, never something the caller needs to handle.
      console.warn('[cogneeGraphLog] logWorkflowDeployed failed', err)
    }
  })()
}
