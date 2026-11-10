/**
 * Workflow-builder eval scorer.
 *
 * Scores an n8n workflow (JSON, as produced by convertToN8nWorkflow) against
 * ground truth from the real n8n instance (node-catalog.json, extracted from
 * the running n8n container) and against what the user asked for (a case's
 * `expect`). Pure and deterministic — no LLM, no network — so it runs in CI.
 *
 * A check is `critical` when a failure means the workflow will not import or
 * run correctly in n8n (hallucinated node, bad version, unreachable node,
 * disabled node, missing required node). Non-critical checks lower the score
 * but do not fail the case.
 */

export interface CatalogNodeInfo {
  creds: string[] // 'name*' = required
  resources: string[]
  operations: Record<string, string[]> // resource | '*' -> operation values
  params: string[]
}

export interface NodeCatalog {
  n8nVersion: string
  nodes: Record<
    string,
    { versions: number[]; group: string[]; byVersion: Record<string, CatalogNodeInfo> }
  >
}

export type TriggerKind = 'webhook' | 'schedule' | 'app' | 'manual'

export interface CaseExpectation {
  /** What starts the workflow. 'app' = a service's own trigger node (new email, new row…). */
  trigger: TriggerKind
  /** Node types that must all be present. */
  nodeTypes?: string[]
  /** At least one of each group must be present (e.g. [gmail, microsoftOutlook]). */
  anyOf?: string[][]
  /** Node types that must not appear. */
  forbidNodeTypes?: string[]
  minNodes?: number
  maxNodes?: number
  /** Workflow must branch (an If/Switch with 2+ used outputs). */
  branches?: boolean
}

export interface N8nNodeLike {
  id?: string
  name: string
  type: string
  typeVersion: number
  parameters?: Record<string, any>
  disabled?: boolean
}

export interface N8nWorkflowLike {
  name?: string
  nodes: N8nNodeLike[]
  connections: Record<string, Partial<Record<string, Array<Array<{ node: string; type?: string; index?: number }> | null>>>>
}

export interface CheckResult {
  id: string
  critical: boolean
  weight: number
  pass: boolean
  detail: string
}

export interface CaseScore {
  score: number // 0..1, weighted
  pass: boolean // every critical check passed
  checks: CheckResult[]
  nodeTypes: string[]
  /** Credentials the user will still have to connect. */
  needsCredentials: string[]
}

/** n8n 2.x disables these by default (NODES_EXCLUDE) — they render as unknown "?" nodes. */
export const DISABLED_BY_DEFAULT = ['n8n-nodes-base.executeCommand', 'n8n-nodes-base.localFileTrigger']

const PLACEHOLDER = /api\.example\.com|UNRESOLVED_INTEGRATION|YOUR_[A-Z_]+|hooks\.slack\.com\/services\/YOUR/i

function isTrigger(type: string, group: string[] | undefined): boolean {
  if (group?.includes('trigger')) return true
  return /Trigger$/.test(type) || /\.webhook$/.test(type) || /\.(cron|interval)$/.test(type)
}

function infoFor(catalog: NodeCatalog, type: string, version: number): CatalogNodeInfo | null {
  const n = catalog.nodes[type]
  if (!n) return null
  return n.byVersion[String(version)] ?? null
}

function triggerKindOf(type: string): TriggerKind {
  if (type === 'n8n-nodes-base.webhook') return 'webhook'
  if (type === 'n8n-nodes-base.scheduleTrigger' || type === 'n8n-nodes-base.cron' || type === 'n8n-nodes-base.interval') return 'schedule'
  if (type === 'n8n-nodes-base.manualTrigger') return 'manual'
  return 'app'
}

function balancedExpression(v: string): boolean {
  let depth = 0
  for (let i = 0; i < v.length - 1; i++) {
    if (v[i] === '{' && v[i + 1] === '{') { depth++; i++ }
    else if (v[i] === '}' && v[i + 1] === '}') { depth--; i++; if (depth < 0) return false }
  }
  return depth === 0
}

function* walkStrings(value: unknown, path = ''): Generator<[string, string]> {
  if (typeof value === 'string') yield [path, value]
  else if (Array.isArray(value)) for (let i = 0; i < value.length; i++) yield* walkStrings(value[i], `${path}[${i}]`)
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) yield* walkStrings(v, path ? `${path}.${k}` : k)
  }
}

export function scoreWorkflow(wf: N8nWorkflowLike, expect: CaseExpectation, catalog: NodeCatalog): CaseScore {
  const checks: CheckResult[] = []
  const add = (id: string, critical: boolean, weight: number, pass: boolean, detail: string) =>
    checks.push({ id, critical, weight, pass, detail: pass ? '' : detail })

  const nodes = wf.nodes || []
  const byName = new Map(nodes.map((n) => [n.name, n]))
  const types = nodes.map((n) => n.type)

  // ── 1. node types exist in this n8n ────────────────────────────────────
  const unknown = nodes.filter((n) => !catalog.nodes[n.type])
  add('node-types-exist', true, 3, unknown.length === 0,
    `not in n8n ${catalog.n8nVersion}: ${unknown.map((n) => n.type).join(', ')}`)

  // ── 2. typeVersion exists for that node ────────────────────────────────
  const badVersion = nodes.filter((n) => {
    const c = catalog.nodes[n.type]
    return c && !c.versions.includes(Number(n.typeVersion))
  })
  add('type-version-valid', true, 3, badVersion.length === 0,
    badVersion.map((n) => `${n.type}@${n.typeVersion} (valid: ${catalog.nodes[n.type].versions.join('/')})`).join('; '))

  // ── 3. nothing n8n disables by default ─────────────────────────────────
  const disabled = nodes.filter((n) => DISABLED_BY_DEFAULT.includes(n.type))
  add('no-disabled-nodes', true, 3, disabled.length === 0,
    `disabled by default in n8n 2.x: ${disabled.map((n) => n.type).join(', ')}`)

  // ── 4. resource / operation values are real ────────────────────────────
  const badOps: string[] = []
  for (const n of nodes) {
    const info = infoFor(catalog, n.type, n.typeVersion)
    if (!info) continue
    const p = n.parameters || {}
    const res = typeof p.resource === 'string' && !p.resource.startsWith('=') ? p.resource : undefined
    if (res && info.resources.length && !info.resources.includes(res)) {
      badOps.push(`${n.type}: resource "${res}" (valid: ${info.resources.join('/')})`)
      continue
    }
    const op = typeof p.operation === 'string' && !p.operation.startsWith('=') ? p.operation : undefined
    if (op) {
      const allowed = [...(res ? info.operations[res] || [] : []), ...(info.operations['*'] || [])]
      const known = Object.values(info.operations).flat()
      if (known.length && allowed.length && !allowed.includes(op)) badOps.push(`${n.type}: operation "${op}" for ${res ?? 'node'}`)
    }
  }
  add('resource-operation-valid', true, 2, badOps.length === 0, badOps.join('; '))

  // ── 5. no invented parameter names ─────────────────────────────────────
  const badParams: string[] = []
  for (const n of nodes) {
    const info = infoFor(catalog, n.type, n.typeVersion)
    if (!info || !info.params.length) continue
    const unknownParams = Object.keys(n.parameters || {}).filter((k) => !info.params.includes(k))
    if (unknownParams.length) badParams.push(`${n.type}: ${unknownParams.join(', ')}`)
  }
  add('params-known', true, 2, badParams.length === 0, badParams.join('; '))

  // ── 6. graph: connections point at real nodes, everything reachable ────
  const dangling: string[] = []
  const edges = new Map<string, Set<string>>() // main-flow adjacency
  const subParents = new Map<string, Set<string>>() // sub-node -> parents (ai_* connections)
  for (const [src, outs] of Object.entries(wf.connections || {})) {
    if (!byName.has(src)) dangling.push(`source "${src}"`)
    for (const [kind, branches] of Object.entries(outs || {})) {
      for (const branch of branches || []) {
        for (const c of branch || []) {
          if (!byName.has(c.node)) { dangling.push(`target "${c.node}"`); continue }
          if (kind === 'main') {
            if (!edges.has(src)) edges.set(src, new Set())
            edges.get(src)!.add(c.node)
          } else {
            if (!subParents.has(src)) subParents.set(src, new Set())
            subParents.get(src)!.add(c.node)
          }
        }
      }
    }
  }
  const triggers = nodes.filter((n) => isTrigger(n.type, catalog.nodes[n.type]?.group))
  const reachable = new Set<string>(triggers.map((t) => t.name))
  const queue = [...reachable]
  while (queue.length) {
    const cur = queue.shift()!
    for (const next of edges.get(cur) || []) if (!reachable.has(next)) { reachable.add(next); queue.push(next) }
  }
  // A sub-node (chat model, memory, tool) is fine if its parent is reachable.
  for (const [sub, parents] of subParents) if ([...parents].some((p) => reachable.has(p))) reachable.add(sub)
  const unreachable = nodes.filter((n) => !reachable.has(n.name))
  add('connections-valid', true, 3, dangling.length === 0, `connections reference missing nodes: ${dangling.join(', ')}`)
  add('all-nodes-reachable', true, 3, unreachable.length === 0,
    `not reachable from the trigger: ${unreachable.map((n) => n.name).join(', ')}`)

  // ── 7. exactly one trigger, of the kind the user asked for ─────────────
  add('single-trigger', true, 2, triggers.length === 1, `${triggers.length} trigger nodes`)
  const kind = triggers[0] ? triggerKindOf(triggers[0].type) : undefined
  add('trigger-kind', true, 2, kind === expect.trigger,
    `wanted ${expect.trigger} trigger, got ${kind ?? 'none'}${triggers[0] ? ` (${triggers[0].type})` : ''}`)

  // ── 8. expected / forbidden nodes ──────────────────────────────────────
  const missing = (expect.nodeTypes || []).filter((t) => !types.includes(t))
  add('expected-nodes', true, 3, missing.length === 0, `missing: ${missing.join(', ')}`)
  const missingAny = (expect.anyOf || []).filter((g) => !g.some((t) => types.includes(t)))
  add('expected-any-of', true, 3, missingAny.length === 0, `none of: ${missingAny.map((g) => g.join('|')).join('; ')}`)
  const forbidden = (expect.forbidNodeTypes || []).filter((t) => types.includes(t))
  add('forbidden-nodes', false, 2, forbidden.length === 0, `unwanted: ${forbidden.join(', ')}`)

  // ── 9. shape ───────────────────────────────────────────────────────────
  if (expect.minNodes !== undefined || expect.maxNodes !== undefined) {
    const n = nodes.length
    add('node-count', false, 1, n >= (expect.minNodes ?? 0) && n <= (expect.maxNodes ?? Infinity),
      `${n} nodes (wanted ${expect.minNodes ?? 0}-${expect.maxNodes ?? '∞'})`)
  }
  if (expect.branches) {
    const branching = nodes.some((n) => /\.(if|switch)$/.test(n.type) &&
      (wf.connections?.[n.name]?.main || []).filter((b) => (b || []).length > 0).length >= 2)
    add('branches', true, 2, branching, 'asked for a branch but no If/Switch uses 2+ outputs')
  }

  // ── 10. leftovers a user would have to fix by hand ─────────────────────
  const placeholders: string[] = []
  const badExpr: string[] = []
  for (const n of nodes) {
    for (const [path, v] of walkStrings(n.parameters || {})) {
      if (PLACEHOLDER.test(v)) placeholders.push(`${n.name}.${path}`)
      if (v.includes('{{') && !balancedExpression(v)) badExpr.push(`${n.name}.${path}`)
    }
    if (n.type === 'n8n-nodes-base.httpRequest' && !String(n.parameters?.url ?? '').trim()) placeholders.push(`${n.name}.url (empty)`)
  }
  add('no-placeholders', false, 1, placeholders.length === 0, `placeholder values: ${placeholders.join(', ')}`)
  add('expressions-balanced', false, 1, badExpr.length === 0, `unbalanced {{ }}: ${badExpr.join(', ')}`)

  // ── result ─────────────────────────────────────────────────────────────
  const total = checks.reduce((s, c) => s + c.weight, 0)
  const got = checks.reduce((s, c) => s + (c.pass ? c.weight : 0), 0)
  // Informational: credential types the user still has to connect (some nodes
  // accept alternatives, e.g. API key OR OAuth2, so this is an upper bound).
  const needsCredentials = Array.from(new Set(
    nodes.flatMap((n) =>
      (infoFor(catalog, n.type, n.typeVersion)?.creds || []).filter((c) => c.endsWith('*')).map((c) => c.slice(0, -1)),
    ),
  ))

  return {
    score: total ? got / total : 0,
    pass: checks.every((c) => !c.critical || c.pass),
    checks,
    nodeTypes: Array.from(new Set(types)),
    needsCredentials,
  }
}
