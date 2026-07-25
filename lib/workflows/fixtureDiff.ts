/**
 * Pure fixture-based-testing logic for Track C. No I/O here — everything
 * operates on already-fetched n8n execution `data` payloads (the shape
 * returned by n8n's `includeData=true` execution-detail endpoint, i.e. what
 * lib/workflows/n8nClient.ts's getExecutionDetailWithCreds()/fixtureRepository's
 * captured `run_data` both contain). Two capabilities:
 *   - diffRunData()                  — C3, live re-run comparison.
 *   - buildPinDataFromFixtureRunData() — C4-equivalent for an already-
 *     deployed workflow (Stage 15/C4 itself is bridge-only, for
 *     copilot-generated drafts under sandbox test — this is the frontend
 *     twin, same parsing convention, feeding lib/workflows/n8nClient.ts's
 *     setWorkflowPinDataWithCreds()).
 */

export interface FixtureDiffEntry {
  nodeName: string
  matched: boolean
  detail: string
}

interface ExtractedNodeResult {
  error: boolean
  itemCount: number
}

/**
 * n8n's execution `data` is nested `resultData.runData` in the modern shape,
 * or occasionally a bare `runData` map in older exports — try both rather
 * than assuming one schema version.
 */
function extractRunData(executionData: unknown): Record<string, ExtractedNodeResult> {
  const out: Record<string, ExtractedNodeResult> = {}
  if (!executionData || typeof executionData !== 'object') return out

  const root = executionData as Record<string, unknown>
  const resultData = root.resultData as Record<string, unknown> | undefined
  const runData = (resultData?.runData ?? root.runData) as Record<string, unknown[]> | undefined
  if (!runData || typeof runData !== 'object') return out

  for (const [nodeName, runs] of Object.entries(runData)) {
    if (!Array.isArray(runs) || runs.length === 0) continue
    const lastRun = runs[runs.length - 1] as Record<string, unknown>
    const itemCount = Array.isArray((lastRun?.data as any)?.main?.[0])
      ? ((lastRun.data as any).main[0] as unknown[]).length
      : 0
    out[nodeName] = { error: Boolean(lastRun?.error), itemCount }
  }
  return out
}

/**
 * Compares a stored fixture's captured run data against a freshly-fetched
 * execution's run data, node by node. Best-effort: nodes present in one but
 * not the other, error-state mismatches, and item-count mismatches are all
 * reported as non-matches — this is a structural sanity check, not a deep
 * value-level diff of each node's actual JSON payload.
 */
export function diffRunData(fixtureData: unknown, freshData: unknown): FixtureDiffEntry[] {
  const fixtureNodes = extractRunData(fixtureData)
  const freshNodes = extractRunData(freshData)
  const allNames = new Set([...Object.keys(fixtureNodes), ...Object.keys(freshNodes)])

  const results: FixtureDiffEntry[] = []
  for (const nodeName of allNames) {
    const f = fixtureNodes[nodeName]
    const n = freshNodes[nodeName]
    if (!f) {
      results.push({ nodeName, matched: false, detail: 'Ran in the fresh execution but not in the fixture' })
    } else if (!n) {
      results.push({ nodeName, matched: false, detail: 'Ran in the fixture but not in the fresh execution' })
    } else if (f.error !== n.error) {
      results.push({ nodeName, matched: false, detail: `Error state differs — fixture: ${f.error}, fresh: ${n.error}` })
    } else if (f.itemCount !== n.itemCount) {
      results.push({ nodeName, matched: false, detail: `Item count differs — fixture: ${f.itemCount}, fresh: ${n.itemCount}` })
    } else {
      results.push({ nodeName, matched: true, detail: 'Matches fixture' })
    }
  }
  return results
}

/**
 * Transforms a captured fixture's raw execution data into n8n's real
 * pinData shape ({[nodeName]: [{json:{...}}]}) — the exact TS twin of
 * n8n-as-code-service/index.js's buildPinDataFromFixtureRunData() (bridge,
 * JS) added for Stage 15/C4, same parsing convention as extractRunData()
 * above. Kept as a separate function rather than reusing extractRunData()
 * since that one only extracts {error, itemCount} for diffing — pinData
 * needs the actual items themselves.
 */
export function buildPinDataFromFixtureRunData(fixtureRunData: unknown): Record<string, { json: Record<string, unknown> }[]> {
  const pinData: Record<string, { json: Record<string, unknown> }[]> = {}
  if (!fixtureRunData || typeof fixtureRunData !== 'object') return pinData

  const root = fixtureRunData as Record<string, unknown>
  const resultData = root.resultData as Record<string, unknown> | undefined
  const runData = (resultData?.runData ?? root.runData) as Record<string, unknown[]> | undefined
  if (!runData || typeof runData !== 'object') return pinData

  for (const [nodeName, runs] of Object.entries(runData)) {
    if (!Array.isArray(runs) || runs.length === 0) continue
    const lastRun = runs[runs.length - 1] as Record<string, unknown>
    const items = (lastRun?.data as any)?.main?.[0]
    if (!Array.isArray(items) || items.length === 0) continue
    // Items are already {json:{...}} envelopes — keep only json/binary,
    // dropping execution-time metadata (pairedItem indices) that won't
    // resolve against a different run.
    pinData[nodeName] = items.map((item: any) => ({
      json: item?.json ?? {},
      ...(item?.binary ? { binary: item.binary } : {}),
    }))
  }
  return pinData
}
