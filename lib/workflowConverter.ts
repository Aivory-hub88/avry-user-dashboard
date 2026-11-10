/**
 * Smart workflow conversion library
 * Maps Aivory workflow steps to correct n8n native nodes with pre-filled parameters.
 *
 * Uses nodeMapper engine for universal intent detection:
 *   detectNodeIntent() → identifies step intent (email, http, ai, respond, etc.)
 *   mapIntentToN8nNode() → builds the correct n8n node with proper parameters
 *
 * Trigger node always uses Webhook with auto-generated path.
 */

import { resolveTrigger, scheduleParameters } from '@/lib/workflows/appNodes'
import { detectNodeIntent, resolveStepByApp, mapIntentToN8nNode, mapIntentToN8nNodes, buildNodeName, refineIntentForContext, type IntentContext } from '@/lib/workflows/nodeMapper'
import type { NodeIntent, MapContext } from '@/lib/workflows/nodeMapper'

// Intents whose n8n node can return multiple items — when immediately
// followed by an AI step, a Limit node is inserted between them so the
// agent doesn't get called once per item (matches the reference workflow:
// RSS Read -> Limit -> AI Agent).
const MULTI_ITEM_INTENTS: NodeIntent[] = ['rss', 'http', 'database']

// n8n-nodes-base.splitInBatches output convention: output 0 fires once
// after all batches are done, output 1 fires once per batch and is where
// the loop body connects. Confirmed against a real n8n instance during
// Stage B6's VPS deploy (a trigger->loop->body->finish sandbox test executed
// end to end with this exact wiring) — not just inferred from docs.
const LOOP_DONE_OUTPUT = 0
const LOOP_BODY_OUTPUT = 1

export interface WorkflowStep {
  step: number
  action: string
  tool: string
  output: string
  inputs?: { url?: string; [key: string]: any }
  /** Integration the planner picked for this step (any spelling: "google_drive", "Google Sheets"…). Primary signal for node choice. */
  app?: string
  /** The planner's action slug for that integration, e.g. "append_row". */
  appAction?: string
  /**
   * Only meaningfully populated for steps sourced from the copilot's
   * GeneratedWorkflowStep ('trigger'|'action'|'condition'|'channel'|
   * 'switch'|'loop') — kept as plain `string` here (not that literal union)
   * because the OTHER producer of this shape, types/workflow.ts's
   * AivoryWorkflowStep (Deep Diagnostic-generated, always linear, never
   * carries `branches`), already types it as a bare `string`.
   */
  type?: string
  /** Nested branch containers — only present for 'condition' | 'switch' | 'loop'. */
  branches?: {
    key: string
    label?: string
    steps: WorkflowStep[]
    /** This branch must NOT connect back into the shared join node after
     *  its steps run (or, if empty, must not connect directly to the join
     *  either) — e.g. an exception/human-review path that ends in an
     *  explicit "awaiting resolution" state rather than silently
     *  continuing into the success path. */
    terminal?: boolean
  }[]
  loopConfig?: { batchSize?: number }
  /**
   * Skip detectNodeIntent()'s text-based guess and use this intent directly.
   * For callers that already KNOW the correct category from a structured
   * source (e.g. the blueprint planner's `ai_processing`/`human_review`
   * step type) rather than needing to re-derive it from free text — text
   * classification is inherently lossy and can collide with an unrelated
   * keyword (e.g. "extract line items" matching the `transform` pattern's
   * "extract" even though the step is really an AI extraction/reasoning task).
   */
  forceIntent?: NodeIntent
  /** Passed straight through to the n8n Agent node's system message — see
   *  blueprintPlanner.ts's PlannedStep.aiOutputSchema. */
  aiOutputSchema?: Record<string, any>
  /** Which $json field the downstream condition/switch inspects. Set by the
   *  blueprint planner for exception gates ('is_complete') and routing
   *  switches ('onboarding_route'). When absent, defaults to 'response'. */
  conditionField?: string
  /** AI governance metadata — proves why the AI Agent is required. */
  aiReasoning?: {
    reasoning_required: true
    reason: string
    deterministic_alternative_available: boolean
  }
  /** True when this step needed an integration but none was matched — drives
   *  nodeMapper.ts's UNRESOLVED_INTEGRATION placeholder URL. */
  unresolvedIntegration?: boolean
  /** Concrete Set-node field mappings (data contract). */
  assignments?: { name: string; value: string }[]
}

interface AivoryWorkflow {
  workflow_id: string
  title: string
  trigger?: string
  trigger_description?: string
  /** The planner's `app` for the trigger step (schedule, webhook, manual, gmail, stripe…). Decides the trigger node. */
  trigger_app?: string
  steps: WorkflowStep[]
  company_name?: string
  diagnostic_score?: number
  created_at?: string
  tags?: string[]
  /**
   * Keep every step's detected intent, even the last one. By default a
   * webhook-triggered workflow's last step becomes Respond to Webhook; when
   * Aether edits an existing canvas that would silently retype a step the
   * user just added (e.g. "update the sheet" at the end).
   */
  keepLastStepIntent?: boolean
  /**
   * Skip the automatic Limit-node insertion (see MULTI_ITEM_INTENTS below).
   * That heuristic exists for copilot-chat-generated steps, where an 'http'/
   * 'rss'/'database' step's real shape is unknown and might return many
   * items (an RSS feed, a bulk query). blueprintPlanner.ts's decomposition
   * is deliberate and already knows exactly what each step fetches (a
   * single CRM/form record) — inserting an uninstructed Limit node there
   * would be exactly the kind of invented constraint the blueprint never
   * asked for.
   */
  skipAutoLimit?: boolean
  /** Resolved integration assumptions (e.g. 'CRM system → HubSpot') — emitted
   *  on the workflow's `meta.assumptions`. */
  assumptions?: string[]
  /** Integration slots that could not be resolved — forces active:false +
   *  meta.requiresConfiguration on the output. */
  needsClarification?: string[]
}

interface N8nNode {
  name: string
  type: string
  typeVersion: number
  position: [number, number]
  parameters: Record<string, any>
  id?: string
  notes?: string
  credentials?: Record<string, { id: string; name: string }>
}

interface N8nWorkflow {
  name: string
  nodes: N8nNode[]
  connections: Record<string, any>
  settings: Record<string, any>
  versionId?: string
  tags?: string[]
  active?: boolean
  meta?: Record<string, any>
}

/**
 * Generate a UUID v4-like ID for n8n nodes (n8n requires UUID format)
 */
function generateNodeId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/**
 * Build the n8n-nodes-base.splitInBatches primary node for a 'loop' step.
 * No matching NodeIntent exists in nodeMapper.ts — loop steps are only ever
 * selected explicitly via step.type (never guessed from text), so this stays
 * local rather than forcing an always-false regex entry into nodeMapper's
 * NodeIntent-keyed pattern table.
 */
function buildLoopNode(step: WorkflowStep, ctx: MapContext): N8nNode {
  const { name: nodeName, notes } = buildNodeName(ctx.stepIndex, step.action)
  return {
    id: generateNodeId(),
    name: nodeName,
    ...(notes ? { notes } : {}),
    type: 'n8n-nodes-base.splitInBatches',
    typeVersion: 3,
    position: [250 + ((ctx.stepIndex + 1) * 220), 300],
    parameters: { batchSize: step.loopConfig?.batchSize ?? 1, options: {} },
  }
}

/**
 * Convert Aivory workflow to n8n format using the nodeMapper engine.
 *
 * Each step is classified via detectNodeIntent() then mapped to a fully
 * configured n8n node via mapIntentToN8nNode(). Steps with `branches` (real
 * condition/switch/loop nodes, not the old single-output if/filter guess)
 * are walked recursively: convertSteps() returns the tail node name a
 * caller should continue its own chain from, and internally wires each
 * branch's tail into a shared n8n-nodes-base.noOp join node (condition/
 * switch) or back into the loop node itself (loop, forming the cyclic
 * back-edge n8n expects for Split In Batches).
 */
export function convertToN8nWorkflow(workflow: AivoryWorkflow): N8nWorkflow {
  const nodes: N8nNode[] = []
  const connections: Record<string, any> = {}

  // 1. Trigger node — chosen from the trigger step's `app` first, its title second.
  const triggerText = `${workflow.trigger || ''} ${workflow.trigger_description || ''}`
  const resolved = resolveTrigger({ app: workflow.trigger_app, title: workflow.trigger, description: workflow.trigger_description })
  const isSchedule = resolved.kind === 'schedule'
  const isWebhook = resolved.kind === 'webhook'

  let triggerNode: N8nNode
  if (resolved.kind === 'schedule') {
    triggerNode = {
      id: generateNodeId(),
      name: 'Schedule Trigger',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.3,
      position: [250, 300],
      parameters: scheduleParameters(triggerText),
    }
  } else if (resolved.kind === 'manual') {
    triggerNode = {
      id: generateNodeId(),
      name: 'Manual Trigger',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [250, 300],
      parameters: {},
    }
  } else if (resolved.kind === 'app' && resolved.build) {
    const b = resolved.build
    triggerNode = {
      id: generateNodeId(),
      name: b.type.replace(/^.*\./, '').replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
      type: b.type,
      typeVersion: b.typeVersion,
      position: [250, 300],
      parameters: b.parameters,
      ...(b.credentials ? { credentials: b.credentials } : {}),
    }
  } else {
    triggerNode = {
      id: generateNodeId(),
      name: 'Webhook Trigger',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 1,
      position: [250, 300],
      parameters: {
        httpMethod: 'POST',
        path: workflow.workflow_id ? `aivory-${workflow.workflow_id}` : `aivory-${Date.now()}`,
        responseMode: 'responseNode',
      },
    }
  }
  nodes.push(triggerNode)

  // Aivory Mail sends every inbound message to one shared webhook, so keep only
  // the events (and mailbox) this workflow is about before the first step.
  let entryName = triggerNode.name
  if (resolved.filter?.length) {
    const filterNode: N8nNode = {
      id: generateNodeId(),
      name: 'Only matching emails',
      type: 'n8n-nodes-base.filter',
      typeVersion: 2.2,
      position: [470, 300],
      parameters: {
        conditions: {
          options: { caseSensitive: false, leftValue: '', typeValidation: 'loose', version: 2 },
          conditions: resolved.filter.map((f) => ({
            id: generateNodeId(),
            leftValue: f.left,
            rightValue: f.right,
            operator: { type: 'string', operation: f.op },
          })),
          combinator: 'and',
        },
        options: {},
      },
    }
    nodes.push(filterNode)
    connections[triggerNode.name] = { main: [[{ node: filterNode.name, type: 'main', index: 0 }]] }
    entryName = filterNode.name
  }

  // Merge a connection into `connections` without clobbering other
  // connection types (or branches) already registered for the same source.
  // `branchIndex` selects which of the source's n8n outputs this connection
  // comes from — always 0 (the only output) for a plain node; only
  // condition/switch/loop primaries have more than one.
  const addConnection = (
    from: string,
    to: string,
    type: 'main' | 'ai_languageModel' | 'ai_memory' | 'ai_tool',
    branchIndex = 0
  ) => {
    if (!connections[from]) connections[from] = {}
    if (!connections[from][type]) connections[from][type] = []
    while (connections[from][type].length <= branchIndex) connections[from][type].push([])
    connections[from][type][branchIndex].push({ node: to, type, index: 0 })
  }

  // 2. Step nodes — classified via nodeMapper engine
  const flatten = (steps: WorkflowStep[]): WorkflowStep[] =>
    steps.flatMap((s) => [s, ...flatten((s.branches || []).flatMap((b) => b.steps))])
  const contextText = [workflow.title, workflow.trigger, workflow.trigger_description,
    ...flatten(workflow.steps || []).map((s) => `${s.action} ${s.tool || ''}`)].join(' ')
  const intentCtx: IntentContext = { googleDrive: /google\s*drive|\bgdrive\b|\bg-drive\b/i.test(contextText) }
  let aiNodeCount = 0
  let globalStepCounter = 0

  /**
   * Recursively convert a step array, wiring each step's primary node from
   * `entryNodeName`'s `entryBranchIndex`-th output (only meaningful for the
   * very first step in `steps`; every step after that chains off the
   * previous one's single default output). Returns the tail node name a
   * caller should continue its own chain from — always that tail's default
   * (index 0) output, since a branchy step's own continuation point (the
   * join node for condition/switch, or the loop node's "done" output for
   * loop) is itself index 0.
   */
  const convertSteps = (
    steps: WorkflowStep[],
    entryNodeName: string,
    entryBranchIndex: number,
    isTopLevel: boolean
  ): string => {
    let prevNodeName = entryNodeName
    let prevBranchIndex = entryBranchIndex
    let prevIntent: NodeIntent | null = null
    const stepCount = steps.length

    steps.forEach((step, i) => {
      const isLast = isTopLevel && i === stepCount - 1
      const hasBranches = !!step.branches?.length

      let primary: N8nNode
      let extraNodes: N8nNode[] | undefined
      let extraConnections: { from: string; to: string; type: 'main' | 'ai_languageModel' | 'ai_memory' | 'ai_tool' }[] | undefined
      let intent: NodeIntent | null = null

      if (hasBranches && step.type === 'switch') {
        const ctx: MapContext = { stepIndex: globalStepCounter++, aiNodeCount, isLast: false }
        primary = mapIntentToN8nNode('switch', step, ctx)
        // Generalize from the base 1-rule scaffold to a real N-way switch —
        // one rule per branch, matching each branch's `key` against a
        // generic field. Placeholder condition, same spirit as every other
        // intent's default parameters (e.g. http's example.com URL) — the
        // user fills in the real field via the inspector's SwitchForm.
        const routeField = step.conditionField || 'response'
        primary.parameters = {
          mode: 'rules',
          rules: {
            values: step.branches!.map((b) => ({
              conditions: {
                options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
                conditions: [
                  { leftValue: `={{ $json.${routeField} }}`, rightValue: b.key, operator: { type: 'string', operation: 'equals' } },
                ],
                combinator: 'and',
              },
              renameOutput: true,
              outputKey: b.label || b.key,
            })),
          },
          options: { fallbackOutput: 'none' },
        }
        console.log(`[workflowConverter] Step ${ctx.stepIndex}: switch with ${step.branches!.length} branch(es)`)
      } else if (hasBranches && step.type === 'loop') {
        const ctx: MapContext = { stepIndex: globalStepCounter++, aiNodeCount, isLast: false }
        primary = buildLoopNode(step, ctx)
        console.log(`[workflowConverter] Step ${ctx.stepIndex}: loop (splitInBatches), batchSize=${step.loopConfig?.batchSize ?? 1}`)
      } else if (hasBranches) {
        // 'condition' — reuse the existing if-node scaffold as-is: it
        // already produces exactly 2 outputs (true=0/false=1), matching
        // branches[0]/branches[1] by array position.
        const ctx: MapContext = { stepIndex: globalStepCounter++, aiNodeCount, isLast: false }
        primary = mapIntentToN8nNode('filter', step, ctx)
        console.log(`[workflowConverter] Step ${ctx.stepIndex}: condition with ${step.branches!.length} branch(es)`)
      } else {
        // Node choice: forced intent > the planner's `app` > title text.
        const byApp = step.forceIntent ? null : resolveStepByApp({ app: step.app, appAction: step.appAction, action: step.action, inputs: step.inputs })
        const ctx: MapContext = { stepIndex: globalStepCounter, aiNodeCount, isLast }
        if (byApp?.native) {
          const { name: nodeName, notes } = buildNodeName(ctx.stepIndex, step.action)
          const n = byApp.native
          primary = {
            id: generateNodeId(),
            name: nodeName,
            ...(notes ? { notes } : {}),
            type: n.type,
            typeVersion: n.typeVersion,
            position: [250 + ((ctx.stepIndex + 1) * 220), 300],
            parameters: n.parameters,
            ...(n.credentials ? { credentials: n.credentials } : {}),
          }
          // Multi-item producers (Sheets read, SQL select…) get the same Limit-before-AI treatment.
          intent = n.multiItem ? 'database' : null
          globalStepCounter++
          console.log(`[workflowConverter] Step ${ctx.stepIndex}: app="${step.app}" → ${n.type}@${n.typeVersion}`)
        } else {
          intent = step.forceIntent ?? byApp?.intent ?? refineIntentForContext(detectNodeIntent(step.action, step.tool), step.action, step.tool, intentCtx)
          console.log(`[workflowConverter] Step ${globalStepCounter}: action="${step.action}" app="${step.app ?? ''}" → intent="${intent}"${step.forceIntent ? ' (forced)' : byApp?.intent ? ' (by app)' : ''} isLast=${isLast}`)
          globalStepCounter++
          const mapped = mapIntentToN8nNodes(intent, step, ctx)
          primary = mapped.primary
          extraNodes = mapped.extraNodes
          extraConnections = mapped.extraConnections
          console.log(`[workflowConverter] Step ${ctx.stepIndex}: mapped to n8n type="${primary.type}" typeVersion=${primary.typeVersion}`)
        }
        if (intent === 'ai') aiNodeCount++
      }

      let connectFromName = prevNodeName
      let connectFromBranch = i === 0 ? prevBranchIndex : 0

      // A multi-item producer feeding straight into an AI step gets a Limit
      // node in between, so the agent runs once per batch instead of once
      // per item (matches n8n's own recommended RSS -> Limit -> AI Agent shape).
      if (!workflow.skipAutoLimit && intent === 'ai' && prevIntent && MULTI_ITEM_INTENTS.includes(prevIntent)) {
        const limitNode: N8nNode = {
          id: generateNodeId(),
          name: `Limit ${globalStepCounter}`,
          type: 'n8n-nodes-base.limit',
          typeVersion: 1,
          position: [primary.position[0] - 110, primary.position[1]],
          parameters: { maxItems: 1 },
        }
        nodes.push(limitNode)
        addConnection(connectFromName, limitNode.name, 'main', connectFromBranch)
        connectFromName = limitNode.name
        connectFromBranch = 0
      }

      nodes.push(primary)
      if (extraNodes) nodes.push(...extraNodes)

      addConnection(connectFromName, primary.name, 'main', connectFromBranch)
      for (const conn of extraConnections ?? []) {
        addConnection(conn.from, conn.to, conn.type)
      }

      prevNodeName = primary.name
      prevBranchIndex = 0
      prevIntent = intent

      if (hasBranches && step.type !== 'loop') {
        // Condition/switch — every branch's tail feeds into a shared join
        // node (n8n-nodes-base.noOp) before the outer chain resumes, so a
        // step following this one in `steps` doesn't have to pick which
        // branch to attach to.
        //
        // Name it short and generic (not `${primary.name} · join`) — reusing
        // the router's full descriptive title made the join node render as a
        // near-duplicate of the router step right next to it on canvas.
        const joinName = `Merge ${globalStepCounter}`
        nodes.push({
          id: generateNodeId(),
          name: joinName,
          type: 'n8n-nodes-base.noOp',
          typeVersion: 1,
          position: [primary.position[0] + 110, primary.position[1] + 260],
          parameters: {},
        })
        step.branches!.forEach((branch, branchIdx) => {
          if (!branch.steps.length) {
            // No extra steps on this output — but it must still connect
            // SOMEWHERE, or n8n dead-ends there with no way to reach the
            // rest of the workflow. Wire it straight to the join, unless
            // this is a `terminal` branch (e.g. an exception path with
            // nothing in it) that's supposed to dead-end.
            if (!branch.terminal) addConnection(primary.name, joinName, 'main', branchIdx)
            return
          }
          const branchTail = convertSteps(branch.steps, primary.name, branchIdx, false)
          // `terminal` branches (e.g. exception/human-review paths) must
          // NOT rejoin the shared join node — otherwise the outer chain
          // silently resumes into the success path after them (e.g.
          // incomplete data flowing straight into account creation).
          if (!branch.terminal) addConnection(branchTail, joinName, 'main')
        })
        prevNodeName = joinName
      } else if (hasBranches && step.type === 'loop') {
        // Loop body recursively converted off the "loop" output; its tail
        // wires back into the loop node itself (the cyclic back-edge n8n's
        // Split In Batches expects). The outer chain resumes from the loop
        // node's "done" output, which happens to also be index 0 — the same
        // default `prevBranchIndex` value already set above.
        const body = step.branches![0]
        if (body?.steps.length) {
          const bodyTail = convertSteps(body.steps, primary.name, LOOP_BODY_OUTPUT, false)
          addConnection(bodyTail, primary.name, 'main')
        }
        prevBranchIndex = LOOP_DONE_OUTPUT
      }
    })

    return prevNodeName
  }

  const tailName = convertSteps(workflow.steps, entryName, 0, true)

  // A webhook set to "respond using Respond to Webhook" needs that node or the
  // caller gets an error. It goes AFTER the last real step — it used to
  // replace it, silently dropping the action the user asked for.
  if (isWebhook && !workflow.keepLastStepIntent && !nodes.some((n) => n.type === 'n8n-nodes-base.respondToWebhook')) {
    const tail = nodes.find((n) => n.name === tailName) ?? triggerNode
    const respond: N8nNode = {
      id: generateNodeId(),
      name: 'Respond to Webhook',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.5,
      position: [tail.position[0] + 220, tail.position[1]],
      parameters: {
        respondWith: 'json',
        responseBody: '={{ JSON.stringify({ status: "success", result: $json.response || $json.body }) }}',
        options: {},
      },
    }
    nodes.push(respond)
    addConnection(tailName, respond.name, 'main')
  }

  // Fix 2 — a workflow with unresolved endpoints must never ship as active.
  // Placeholder URLs (api.example.com / UNRESOLVED_INTEGRATION) mark nodes
  // that need manual configuration before the workflow is executable.
  const hasPlaceholderUrl = nodes.some((n) =>
    /example\.com\/endpoint|UNRESOLVED_INTEGRATION/i.test(String(n.parameters?.url ?? '')))
  const requiresConfiguration = hasPlaceholderUrl || (workflow.needsClarification?.length ?? 0) > 0

  const meta: Record<string, any> = {}
  if (workflow.assumptions?.length) meta.assumptions = workflow.assumptions
  if (workflow.needsClarification?.length) meta.needsClarification = workflow.needsClarification
  if (requiresConfiguration) meta.requiresConfiguration = true

  return {
    name: workflow.title,
    nodes,
    connections,
    settings: { executionOrder: 'v1' },
    versionId: generateNodeId(),
    tags: workflow.tags || [],
    // active:false + meta.requiresConfiguration when anything is unresolved;
    // otherwise leave `active` unset (n8n default) so the caller controls it.
    ...(requiresConfiguration ? { active: false } : {}),
    ...(Object.keys(meta).length ? { meta } : {}),
  }
}

/**
 * Generate a download-ready n8n JSON blob and trigger browser download
 */
export function downloadN8nJSON(workflow: AivoryWorkflow, filename?: string): void {
  const n8nWorkflow = convertToN8nWorkflow(workflow)
  const blob = new Blob([JSON.stringify(n8nWorkflow, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `${workflow.title.replace(/\s+/g, '-').toLowerCase()}-n8n.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Convert workflow to n8n JSON string (for API calls, no browser needed)
 */
export function convertToN8nJsonString(workflow: AivoryWorkflow): string {
  const n8nWorkflow = convertToN8nWorkflow(workflow)
  return JSON.stringify(n8nWorkflow, null, 2)
}
