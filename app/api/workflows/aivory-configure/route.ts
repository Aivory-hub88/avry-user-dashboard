import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/workflows/aivory-configure
 * Node configuration copilot — turn a natural-language intent into concrete
 * config values for one workflow node, so it is ready to deploy to n8n.
 *
 * Body:    { nodeTitle, nodeType, currentConfig, intent, workflowName? }
 * Returns  { config: <partial config patch>, summary: string }
 *
 * The bridge /workflows/edit endpoint is a generic LLM edit entrypoint; we ask
 * it to return ONLY a JSON object matching the current config shape, then
 * defensively extract + schema-guard the result (only keys that already exist
 * on currentConfig are kept, so a hallucinated shape can never corrupt a node).
 */
export const runtime = 'nodejs'
export const maxDuration = 120

const BRIDGE = (
  process.env.VPS_BRIDGE_URL ||
  process.env.NEXT_PUBLIC_VPS_BRIDGE_URL ||
  'http://host.docker.internal:3003'
).replace(/\/$/, '')

/** Find the first parseable JSON object in a blob of text. */
function extractJsonObject(text: string): Record<string, any> | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  for (let end = text.length; end > start; end--) {
    if (text[end - 1] !== '}') continue
    try { return JSON.parse(text.slice(start, end)) } catch { /* keep shrinking */ }
  }
  return null
}

/** Keep only keys that exist on the current config, preserving value types where possible. */
function schemaGuard(patch: Record<string, any>, current: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in current)) continue
    if (key === 'type') continue // never let the LLM change the node type
    const cur = current[key]
    if (cur !== null && cur !== undefined && typeof cur !== typeof value) {
      // tolerate number-as-string ("30" -> 30) but drop other type mismatches
      if (typeof cur === 'number' && typeof value === 'string' && value.trim() !== '' && !isNaN(Number(value))) {
        out[key] = Number(value)
      }
      continue
    }
    out[key] = value
  }
  return out
}

export async function POST(req: NextRequest) {
  let body: Record<string, any>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const intent = (body?.intent ?? '').toString().trim()
  const currentConfig = body?.currentConfig
  if (!intent) return NextResponse.json({ error: 'intent is required' }, { status: 400 })
  if (!currentConfig || typeof currentConfig !== 'object' || !currentConfig.type) {
    return NextResponse.json({ error: 'currentConfig with a type is required' }, { status: 400 })
  }

  const nodeTitle = (body?.nodeTitle ?? 'this node').toString()
  const instruction = [
    `Configure the "${nodeTitle}" node (type: ${currentConfig.type}) of this workflow so it is ready to deploy to n8n.`,
    `User request: ${intent}`,
    `Current configuration JSON: ${JSON.stringify(currentConfig)}`,
    `Respond with ONLY a JSON object using exactly the same keys as the current configuration (same shape, no new keys, keep "type" unchanged), with values updated to satisfy the user request. Use realistic, deploy-ready values. Do not include any prose outside the JSON.`,
  ].join('\n')

  try {
    const r = await fetch(`${BRIDGE}/workflows/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entrypoint: 'node_configure',
        mode: 'CONFIGURE_NODE',
        intent: instruction,
        instruction,
        workflow: body?.workflow ?? { workflowName: body?.workflowName ?? '', steps: [] },
      }),
      signal: AbortSignal.timeout(115_000),
    })

    if (!r.ok) {
      return NextResponse.json(
        { error: `AI configure engine returned ${r.status}` },
        { status: 502 },
      )
    }

    const data = await r.json().catch(() => ({} as any))

    // The bridge may hand back the config in several places — try them in order.
    const candidates: any[] = [
      data?.config,
      data?.workflow?.config,
      data?.workflow, // when the LLM returned the bare config object as "the workflow"
      typeof data?.message === 'string' ? extractJsonObject(data.message) : null,
      typeof data?.summary === 'string' ? extractJsonObject(data.summary) : null,
      typeof data === 'string' ? extractJsonObject(data) : null,
    ]

    let patch: Record<string, any> | null = null
    for (const c of candidates) {
      if (!c || typeof c !== 'object' || Array.isArray(c)) continue
      const guarded = schemaGuard(c, currentConfig)
      if (Object.keys(guarded).length > 0) { patch = guarded; break }
    }

    if (!patch) {
      return NextResponse.json(
        { error: 'Aivory could not produce a valid configuration for this request. Try rephrasing, or configure the node manually in the inspector.' },
        { status: 422 },
      )
    }

    return NextResponse.json({
      config: { ...currentConfig, ...patch },
      summary: typeof data?.summary === 'string' && !data.summary.trim().startsWith('{')
        ? data.summary
        : `Updated ${Object.keys(patch).length} setting${Object.keys(patch).length === 1 ? '' : 's'} on ${nodeTitle}`,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI configure failed' },
      { status: 500 },
    )
  }
}
