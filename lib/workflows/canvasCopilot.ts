/**
 * Canvas <-> Copilot bridge.
 *
 * Lets Aivory Aether edit the workflow that is already on the canvas instead
 * of only generating new ones:
 *
 *   1. canvasToGeneratedWorkflow() turns the live canvas (as n8n JSON) into the
 *      copilot's GeneratedWorkflow step tree, so the state machine's existing
 *      EDITING path (bridge `edit` op) can work on it.
 *   2. mergeEditedNodes() takes the canvas nodes rebuilt from the edited steps
 *      and carries the ORIGINAL node over for every step the edit left
 *      untouched — same type, parameters, credentials, inspector config,
 *      error handling, AI sub-nodes. Only new or changed steps get freshly
 *      mapped nodes, so an edit never wipes the user's configuration.
 *
 * Pure functions only — no React, no fetch — so they are unit-tested directly.
 */
import type { Node, Edge } from '@xyflow/react'
import type { N8nWorkflow, N8nNode } from '@/lib/n8n'
import type { WorkflowNodeData } from '@/types/workflow-node'
import type { GeneratedWorkflow, GeneratedWorkflowStep } from './copilotStateMachine'
import { placeEditedNodes } from './flowLayout'

/** What the client sends with each copilot message while a canvas is open. */
export interface CanvasEditContext {
  workflowId: string
  title: string
  workflow: GeneratedWorkflow
}

const AI_SUB_TYPES = ['ai_languageModel', 'ai_memory', 'ai_tool'] as const
const STEP_PREFIX = /^step\s+\d+\s*:\s*/i

/** "Step 3: Upload Backup…" -> "upload backup…" — the key edits are matched on. */
export function normalizeStepTitle(title: string): string {
  return (title || '').replace(STEP_PREFIX, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function displayTitle(name: string): string {
  return (name || '').replace(STEP_PREFIX, '').trim() || name
}

/** n8n-nodes-base.googleDrive -> "google drive"; @n8n/...lmChatOpenAi -> "lm chat open ai". */
function appFromType(type: string): string {
  const short = (type || '').split('.').pop() || ''
  return short
    .replace(/Trigger$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim()
}

function isTriggerType(type: string): boolean {
  return /trigger$/i.test(type) || /\.webhook$/i.test(type) || /\.(cron|interval)$/i.test(type)
}

function stepType(node: N8nNode, outputs: number): GeneratedWorkflowStep['type'] {
  if (isTriggerType(node.type)) return 'trigger'
  if (/\.switch$/i.test(node.type)) return 'switch'
  if (/\.(if|filter)$/i.test(node.type) || outputs > 1) return 'condition'
  if (/\.splitInBatches$/i.test(node.type)) return 'loop'
  return 'action'
}

/**
 * Walk the canvas graph from its trigger and rebuild the copilot step tree.
 * Branch heads (if/switch outputs) become `branches`; a node reached by more
 * than one path is treated as the join and continues the outer chain.
 * AI sub-nodes (chat model, memory, tools) are folded into their parent.
 */
export function canvasToGeneratedWorkflow(wf: N8nWorkflow): GeneratedWorkflow {
  const byName = new Map(wf.nodes.map((n) => [n.name, n]))
  const subNodes = new Set<string>()
  const indegree = new Map<string, number>()

  for (const [src, outs] of Object.entries(wf.connections || {})) {
    for (const t of AI_SUB_TYPES) if (outs[t]?.length) subNodes.add(src)
    for (const branch of outs.main || []) {
      for (const c of branch || []) indegree.set(c.node, (indegree.get(c.node) ?? 0) + 1)
    }
  }

  const mainOutputs = (name: string): string[][] =>
    (wf.connections?.[name]?.main || []).map((b) => (b || []).map((c) => c.node).filter((n) => byName.has(n)))

  const visited = new Set<string>()

  const toStep = (node: N8nNode, outputs: number): GeneratedWorkflowStep => ({
    id: node.id || node.name,
    type: stepType(node, outputs),
    title: displayTitle(node.name),
    ...(node.notes ? { description: node.notes } : {}),
    app: appFromType(node.type),
    nodeType: node.type,
    testable: !isTriggerType(node.type),
  })

  // Returns the chain starting at `start`; stops at a join (indegree > 1)
  // unless `allowJoinAtStart`, or at an already-visited node.
  const walk = (start: string | undefined, allowJoinAtStart: boolean): { steps: GeneratedWorkflowStep[]; join?: string } => {
    const steps: GeneratedWorkflowStep[] = []
    let cur = start
    let first = true
    while (cur && byName.has(cur) && !visited.has(cur)) {
      if (!(first && allowJoinAtStart) && (indegree.get(cur) ?? 0) > 1) return { steps, join: cur }
      first = false
      visited.add(cur)
      const node = byName.get(cur)!
      // The converter's explicit "else: do nothing" end is plumbing, not a step.
      if (node.type === 'n8n-nodes-base.noOp' && node.name === 'Nothing to do') break
      const outs = mainOutputs(cur)
      const step = toStep(node, outs.length)

      if (outs.length > 1 && (step.type === 'condition' || step.type === 'switch')) {
        let join: string | undefined
        step.branches = outs.map((targets, i) => {
          const r = walk(targets[0], false)
          join = join ?? r.join
          return {
            key: step.type === 'condition' ? (i === 0 ? 'true' : 'false') : `output_${i}`,
            label: step.type === 'condition' ? (i === 0 ? 'True' : 'False') : `Output ${i + 1}`,
            steps: r.steps,
          }
        })
        steps.push(step)
        cur = join
        // The converter's own join node (a no-op) is plumbing, not a step the user
        // asked for. Handing it to the model as a step made every edit add another
        // Merge node, so continue past it.
        if (cur && byName.get(cur)?.type === 'n8n-nodes-base.noOp' && !visited.has(cur)) {
          visited.add(cur)
          cur = mainOutputs(cur)[0]?.[0]
        }
        first = true
        allowJoinAtStart = true
        continue
      }

      steps.push(step)
      cur = outs[0]?.[0]
    }
    return { steps }
  }

  const mainNodes = wf.nodes.filter((n) => !subNodes.has(n.name))
  const trigger = mainNodes.find((n) => isTriggerType(n.type)) ?? mainNodes.find((n) => !indegree.get(n.name))
  const steps = trigger ? walk(trigger.name, true).steps : []

  // Nodes not reachable from the trigger still belong to the workflow — keep
  // them (as plain actions) so an edit never silently drops them.
  for (const n of mainNodes) {
    if (!visited.has(n.name)) {
      visited.add(n.name)
      steps.push(toStep(n, 0))
    }
  }

  return {
    workflowName: wf.name || 'Current workflow',
    steps,
    estimate_hours: 0,
    automation_score: 0,
    summary: '',
    nodeConfigs: [],
  }
}

/** Count of real steps (excluding the trigger) — used to decide whether a canvas is worth editing. */
export function countSteps(steps: GeneratedWorkflowStep[]): number {
  return steps.reduce(
    (sum, s) => sum + 1 + countSteps((s.branches || []).flatMap((b) => b.steps)),
    0,
  )
}

type RFNode = Node<WorkflowNodeData>

function isSubEdge(e: Edge): boolean {
  return e.type === 'aiSubConnection'
}

/**
 * Replace the canvas with `next` (built from the edited steps) while keeping
 * every unchanged step's original node. A step counts as unchanged when its
 * title (ignoring the "Step N:" prefix, which renumbers) matches an original
 * node's title. Matched nodes keep the original node's data — type, raw n8n
 * parameters, credentials, inspector config, error handling — and their AI
 * sub-nodes; the freshly generated sub-nodes for that node are dropped.
 */
/**
 * The edit engine keeps each step's `id` (= the original canvas node id from
 * canvasToGeneratedWorkflow) but freely rewrites titles of steps it didn't
 * touch ("Send" -> "Send Slack Message"). Map every edited step title back to
 * the original node id it came from, so the merge matches on identity first.
 */
const STRUCTURAL_STEP_TYPES = new Set<GeneratedWorkflowStep['type']>(['trigger', 'condition', 'switch', 'loop'])

function appKey(app: string | undefined): string {
  return (app || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Is `edited` still the same step as `original`, or did the edit engine reuse
 * the id for a different step? The engine keeps ids even when it replaces a
 * step outright ("Step 2: Check" a Google Drive action -> "Check if Data
 * Exists" a condition). Keeping the old node then leaves a Drive node where an
 * IF belongs — no true/false outputs, so its branch edges vanish and the rest
 * of the flow floats unconnected on the canvas.
 */
export function isSameStepKind(original: GeneratedWorkflowStep, edited: GeneratedWorkflowStep): boolean {
  if (
    (STRUCTURAL_STEP_TYPES.has(original.type) || STRUCTURAL_STEP_TYPES.has(edited.type)) &&
    original.type !== edited.type
  ) return false
  if (original.nodeType && edited.nodeType && original.nodeType === edited.nodeType) return true
  const a = appKey(original.app)
  const b = appKey(edited.app)
  return !a || !b || a === b
}

function flattenStepTree(steps: GeneratedWorkflowStep[]): GeneratedWorkflowStep[] {
  return steps.flatMap((s) => [s, ...flattenStepTree((s.branches || []).flatMap((b) => b.steps))])
}

export function stepIdAliases(
  editedSteps: GeneratedWorkflowStep[],
  originalNodes: RFNode[],
  /** The canvas steps before the edit — when given, an id reused for a different kind of step is not an alias. */
  originalSteps?: GeneratedWorkflowStep[],
): Map<string, string> {
  const ids = new Set(originalNodes.map((n) => n.id))
  const origById = new Map(flattenStepTree(originalSteps || []).map((s) => [s.id, s]))
  const out = new Map<string, string>()
  const visit = (steps: GeneratedWorkflowStep[]) => {
    for (const s of steps) {
      const key = normalizeStepTitle(s.title)
      const before = s.id ? origById.get(s.id) : undefined
      const sameKind = !before || isSameStepKind(before, s)
      if (s.id && ids.has(s.id) && key && sameKind && !out.has(key)) out.set(key, s.id)
      for (const b of s.branches || []) visit(b.steps)
    }
  }
  visit(editedSteps)
  return out
}

function isTriggerNode(n: RFNode): boolean {
  const type = n.data?.rawN8n?.type
  return typeof type === 'string' ? isTriggerType(type) : n.data?.category === 'trigger'
}

/** The node's output shape — a kept node must expose the handles the new edges use. */
function outputShape(n: RFNode): string {
  const type = String(n.data?.rawN8n?.type || '')
  if (isTriggerNode(n)) return 'trigger'
  if (/\.(if|filter)$/i.test(type)) return 'if'
  if (/\.switch$/i.test(type)) return 'switch'
  if (/\.splitInBatches$/i.test(type)) return 'loop'
  return 'single'
}

export function mergeEditedNodes(
  original: { nodes: RFNode[]; edges: Edge[] },
  next: { nodes: RFNode[]; edges: Edge[] },
  options: {
    /** The edit left the trigger step alone — keep the original trigger node
     *  even though the converter rebuilt it under a generic title. */
    keepTrigger?: boolean
    /** normalized edited title -> original node id (see stepIdAliases). */
    idAliases?: Map<string, string>
    /** Original node ids that must not be kept (applyEditToCanvas excludes
     *  nodes the connection check implicated). Their steps get fresh nodes. */
    exclude?: ReadonlySet<string>
    /** Test hook: false disables the output-shape guard, to prove the
     *  connection check repairs what the guard would have prevented. */
    checkOutputShape?: boolean
  } = {},
): {
  nodes: RFNode[]
  edges: Edge[]
  kept: number
  added: number
  removed: number
  /** next node id -> the original node id whose data it kept. */
  keptIds: Map<string, string>
} {
  const excluded = options.exclude ?? new Set<string>()
  const shapeGuard = options.checkOutputShape !== false
  const origSubIds = new Set(original.edges.filter(isSubEdge).map((e) => e.source))
  const nextSubIds = new Set(next.edges.filter(isSubEdge).map((e) => e.source))

  const origByTitle = new Map<string, RFNode>()
  for (const n of original.nodes) {
    if (origSubIds.has(n.id)) continue
    const key = normalizeStepTitle(n.data?.title || n.data?.label || '')
    if (key && !origByTitle.has(key)) origByTitle.set(key, n)
  }

  const matched = new Map<string, RFNode>() // next id -> original node
  const usedOrig = new Set<string>()
  for (const n of next.nodes) {
    if (nextSubIds.has(n.id)) continue
    const key = normalizeStepTitle(n.data?.title || n.data?.label || '')
    const aliasId = key ? options.idAliases?.get(key) : undefined
    const byId = aliasId ? original.nodes.find((o) => o.id === aliasId && !origSubIds.has(o.id)) : undefined
    const orig = byId ?? (key ? origByTitle.get(key) : undefined)
    if (orig && !usedOrig.has(orig.id) && !excluded.has(orig.id) && (!shapeGuard || outputShape(orig) === outputShape(n))) {
      matched.set(n.id, orig)
      usedOrig.add(orig.id)
    }
  }

  if (options.keepTrigger) {
    const nextTrigger = next.nodes.find((n) => isTriggerNode(n) && !matched.has(n.id))
    const origTrigger = original.nodes.find((n) => isTriggerNode(n) && !usedOrig.has(n.id) && !excluded.has(n.id))
    if (nextTrigger && origTrigger) matched.set(nextTrigger.id, origTrigger)
    if (nextTrigger && origTrigger) usedOrig.add(origTrigger.id)
  }

  // Sub-nodes of matched next-nodes are replaced by the original's sub-nodes.
  const droppedNextSubs = new Set(
    next.edges.filter((e) => isSubEdge(e) && matched.has(e.target)).map((e) => e.source),
  )

  // Existing steps stay exactly where the user has them; new steps are placed
  // after their parents with the downstream part of the flow shifted to make
  // room (see placeEditedNodes). Nothing is re-laid out wholesale.
  const mainNext = next.nodes.filter((n) => !nextSubIds.has(n.id)).length
  const mainOrig = original.nodes.filter((n) => !origSubIds.has(n.id)).length
  const mainNextNodes = next.nodes.filter((n) => !nextSubIds.has(n.id))
  const finalPos = placeEditedNodes({
    ids: mainNextNodes.map((n) => n.id),
    edges: next.edges.filter((e) => !isSubEdge(e)).map((e) => ({ source: e.source, target: e.target })),
    kept: new Map([...matched].filter(([id]) => !nextSubIds.has(id)).map(([id, orig]) => [id, orig.position])),
    fresh: new Map(mainNextNodes.map((n) => [n.id, n.position])),
  })
  const subParent = new Map(next.edges.filter(isSubEdge).map((e) => [e.source, e.target]))

  const nodes: RFNode[] = []
  for (const n of next.nodes) {
    if (droppedNextSubs.has(n.id)) continue
    const orig = matched.get(n.id)
    if (!orig) {
      // New node. A new AI sub-node stays under its parent; a new step uses its placed position.
      const parentId = subParent.get(n.id)
      const parentFresh = parentId ? next.nodes.find((x) => x.id === parentId)?.position : undefined
      const parentFinal = parentId ? finalPos.get(parentId) : undefined
      const position = nextSubIds.has(n.id) && parentFresh && parentFinal
        ? { x: parentFinal.x + (n.position.x - parentFresh.x), y: parentFinal.y + (n.position.y - parentFresh.y) }
        : (finalPos.get(n.id) ?? n.position)
      nodes.push({ ...n, position })
      continue
    }
    // A kept trigger keeps its own name (the converter titles every trigger
    // generically); other kept steps take the renumbered "Step N:" title.
    const keepName = options.keepTrigger && isTriggerNode(orig)
    nodes.push({
      ...n,
      position: finalPos.get(n.id) ?? n.position,
      data: keepName
        ? { ...orig.data }
        : { ...orig.data, title: n.data.title, label: n.data.label ?? orig.data.label },
    })
  }

  const edges: Edge[] = next.edges.filter((e) => !droppedNextSubs.has(e.source))
  for (const [nextId, orig] of matched) {
    for (const e of original.edges) {
      if (!isSubEdge(e) || e.target !== orig.id) continue
      const sub = original.nodes.find((x) => x.id === e.source)
      if (!sub) continue
      if (!nodes.some((x) => x.id === sub.id)) {
        const parent = nodes.find((x) => x.id === nextId)
        nodes.push({
          ...sub,
          // Same offset from its parent as before, wherever the parent ended up.
          position: parent
            ? { x: sub.position.x + (parent.position.x - orig.position.x), y: sub.position.y + (parent.position.y - orig.position.y) }
            : sub.position,
        })
      }
      edges.push({ ...e, id: `${e.id}-kept`, target: nextId })
    }
  }

  return {
    nodes,
    edges,
    kept: matched.size,
    added: mainNext - matched.size,
    removed: mainOrig - matched.size,
    keptIds: new Map([...matched].map(([id, orig]) => [id, orig.id])),
  }
}

// ── Connection check ──────────────────────────────────────────────────────

export type CanvasIssueKind = 'missing-node' | 'missing-handle' | 'unreachable'

export interface CanvasIssue {
  kind: CanvasIssueKind
  /** The node the issue is about (an edge's source for edge issues). */
  nodeId: string
  /** Human-readable step title, for messages. */
  title: string
  edgeId?: string
  message: string
}

function nodeTitle(n: RFNode | undefined, fallback: string): string {
  return displayTitle(String(n?.data?.title || n?.data?.label || fallback))
}

/**
 * The source handle ids a node renders (see WorkflowNode): a node with more
 * than one `data.outputs` entry exposes exactly those ids; every other node
 * has a single source handle with no id. `null` stands for that unnamed one.
 */
function sourceHandles(n: RFNode): Set<string | null> {
  const outs = (n.data as { outputs?: { id: string }[] } | undefined)?.outputs
  return outs && outs.length > 1 ? new Set(outs.map((o) => o.id)) : new Set([null])
}

/**
 * Everything on a canvas that React Flow would silently not draw or that
 * would never run: edges whose source/target node is missing, edges leaving
 * a handle the source node does not expose, and main nodes no trigger
 * reaches (skipped when the canvas has no trigger). AI sub-node links
 * (`aiSubConnection`) are not main flow and are only checked for dangling ends.
 */
export function checkCanvasIntegrity(nodes: RFNode[], edges: Edge[]): CanvasIssue[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const issues: CanvasIssue[] = []
  const subIds = new Set(edges.filter(isSubEdge).map((e) => e.source))
  const live: Edge[] = []

  for (const e of edges) {
    const src = byId.get(e.source)
    const tgt = byId.get(e.target)
    if (!src || !tgt) {
      const missing = !src ? e.source : e.target
      issues.push({
        kind: 'missing-node',
        nodeId: src ? e.source : tgt ? e.target : e.source,
        title: nodeTitle(src ?? tgt, missing),
        edgeId: e.id,
        message: `A connection points to a step that no longer exists (${missing}).`,
      })
      continue
    }
    if (isSubEdge(e)) continue
    const handle = e.sourceHandle ?? null
    if (handle !== null && !sourceHandles(src).has(handle)) {
      issues.push({
        kind: 'missing-handle',
        nodeId: src.id,
        title: nodeTitle(src, src.id),
        edgeId: e.id,
        message: `"${nodeTitle(src, src.id)}" has no "${handle}" output, so its link to "${nodeTitle(tgt, tgt.id)}" would not be drawn.`,
      })
      continue
    }
    live.push(e)
  }

  const main = nodes.filter((n) => !subIds.has(n.id))
  const triggers = main.filter(isTriggerNode)
  if (triggers.length) {
    const out = new Map<string, string[]>()
    for (const e of live) out.set(e.source, [...(out.get(e.source) || []), e.target])
    const seen = new Set(triggers.map((t) => t.id))
    const queue = triggers.map((t) => t.id)
    while (queue.length) {
      for (const t of out.get(queue.shift()!) || []) {
        if (!seen.has(t)) {
          seen.add(t)
          queue.push(t)
        }
      }
    }
    for (const n of main) {
      if (seen.has(n.id)) continue
      issues.push({
        kind: 'unreachable',
        nodeId: n.id,
        title: nodeTitle(n, n.id),
        message: `"${nodeTitle(n, n.id)}" is not connected to the trigger, so it would never run.`,
      })
    }
  }
  return issues
}

/**
 * mergeEditedNodes + checkCanvasIntegrity with auto-repair: when the merged
 * canvas has issues, every kept original node implicated in one (the source
 * of a broken edge; with no broken edges, an unreachable node and its direct
 * predecessors) is excluded and the merge re-run, so that step gets a freshly mapped
 * node with the right handles. At most 3 repair rounds. `reset` names the
 * steps whose old settings the repair dropped; `issues` is what is still
 * broken — the caller must not apply a canvas with issues left.
 */
export function applyEditToCanvas(
  original: { nodes: RFNode[]; edges: Edge[] },
  next: { nodes: RFNode[]; edges: Edge[] },
  opts: Parameters<typeof mergeEditedNodes>[2] = {},
): ReturnType<typeof mergeEditedNodes> & { issues: CanvasIssue[]; reset: string[] } {
  const exclude = new Set(opts.exclude ?? [])
  const reset: string[] = []
  let merged = mergeEditedNodes(original, next, { ...opts, exclude })
  let issues = checkCanvasIntegrity(merged.nodes, merged.edges)

  for (let round = 0; round < 3 && issues.length; round++) {
    // Broken edges explain most unreachable nodes (an IF slot that kept a
    // single-output node drops both branch edges), so blame only the nodes
    // owning a broken edge first; downstream steps keep their settings.
    // Only when every edge is fine are unreachable nodes and their direct
    // predecessors blamed.
    const implicated = new Set<string>()
    const edgeIssues = issues.filter((i) => i.kind !== 'unreachable')
    for (const i of edgeIssues) implicated.add(i.nodeId)
    if (!edgeIssues.length) {
      const mainEdges = merged.edges.filter((e) => !isSubEdge(e))
      for (const i of issues) {
        implicated.add(i.nodeId)
        for (const e of mainEdges) if (e.target === i.nodeId) implicated.add(e.source)
      }
    }
    const newlyExcluded: string[] = []
    for (const nextId of implicated) {
      const origId = merged.keptIds.get(nextId)
      if (!origId || exclude.has(origId)) continue
      exclude.add(origId)
      newlyExcluded.push(nextId)
    }
    if (!newlyExcluded.length) break // nothing kept to blame: a real structural problem
    for (const nextId of newlyExcluded) {
      const n = merged.nodes.find((x) => x.id === nextId)
      const title = nodeTitle(n, nextId)
      if (!reset.includes(title)) reset.push(title)
    }
    merged = mergeEditedNodes(original, next, { ...opts, exclude })
    issues = checkCanvasIntegrity(merged.nodes, merged.edges)
  }

  return { ...merged, issues, reset }
}

// ── Change preview ────────────────────────────────────────────────────────

export type StepChangeKind = 'added' | 'removed' | 'kept' | 'renamed'

export interface StepChange {
  kind: StepChangeKind
  title: string
  /** Previous title — only for 'renamed'. */
  from?: string
  /** Nesting depth (branch steps are indented in the preview). */
  depth: number
}

export interface ChangePreview {
  changes: StepChange[]
  added: number
  removed: number
  kept: number
  renamed: number
}

function flattenSteps(steps: GeneratedWorkflowStep[], depth = 0): { step: GeneratedWorkflowStep; depth: number }[] {
  return steps.flatMap((s) => [
    { step: s, depth },
    ...flattenSteps((s.branches || []).flatMap((b) => b.steps), depth + 1),
  ])
}

/**
 * What applying `edited` would do to the canvas that currently holds
 * `original`. Steps are matched on id first (the edit engine keeps ids but
 * may rewrite titles), then on normalized title. Matches the same rules as
 * mergeEditedNodes, so the preview never promises a node is kept when the
 * merge would rebuild it.
 */
export function diffSteps(original: GeneratedWorkflowStep[], edited: GeneratedWorkflowStep[]): ChangePreview {
  const orig = flattenSteps(original)
  const used = new Set<number>()
  const changes: StepChange[] = []

  for (const { step, depth } of flattenSteps(edited)) {
    let idx = step.id ? orig.findIndex((o, i) => !used.has(i) && o.step.id === step.id && isSameStepKind(o.step, step)) : -1
    if (idx < 0) {
      const key = normalizeStepTitle(step.title)
      idx = orig.findIndex((o, i) => !used.has(i) && normalizeStepTitle(o.step.title) === key && isSameStepKind(o.step, step))
    }
    if (idx < 0) {
      changes.push({ kind: 'added', title: step.title, depth })
      continue
    }
    used.add(idx)
    const before = orig[idx].step.title
    const renamed = normalizeStepTitle(before) !== normalizeStepTitle(step.title)
    changes.push(renamed ? { kind: 'renamed', title: step.title, from: before, depth } : { kind: 'kept', title: step.title, depth })
  }
  orig.forEach(({ step, depth }, i) => {
    if (!used.has(i)) changes.push({ kind: 'removed', title: step.title, depth })
  })

  const count = (k: StepChangeKind) => changes.filter((c) => c.kind === k).length
  return { changes, added: count('added'), removed: count('removed'), kept: count('kept'), renamed: count('renamed') }
}

// ── Server-owned step ids ─────────────────────────────────────────────────

/**
 * The edit/repair model must not decide step identity. Keep an id only when
 * it belonged to the workflow before the edit, is used once, and still names
 * the same kind of step (isSameStepKind). Every other id — reused for a
 * replaced step, duplicated, or invented — gets a fresh server-minted id, so
 * the canvas merge never carries an old node into a slot it no longer fits.
 */
export function reconcileEditedIds(
  before: GeneratedWorkflowStep[],
  edited: GeneratedWorkflowStep[],
  mintId: () => string = () => `step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
): { steps: GeneratedWorkflowStep[]; kept: number; reminted: number } {
  const origById = new Map(flattenStepTree(before).map((s) => [s.id, s]))
  const seen = new Set<string>()
  let kept = 0
  let reminted = 0
  const visit = (steps: GeneratedWorkflowStep[]): GeneratedWorkflowStep[] =>
    steps.map((s) => {
      const orig = s.id ? origById.get(s.id) : undefined
      const keep = !!orig && !seen.has(s.id) && isSameStepKind(orig, s)
      let id = s.id
      if (keep) kept++
      else {
        id = mintId()
        reminted++
      }
      seen.add(id)
      const out: GeneratedWorkflowStep = { ...s, id }
      // A replaced step must not inherit the old node's resolved n8n type.
      if (!keep && orig && out.nodeType === orig.nodeType) delete out.nodeType
      if (s.branches) out.branches = s.branches.map((b) => ({ ...b, steps: visit(b.steps) }))
      return out
    })
  return { steps: visit(edited), kept, reminted }
}
