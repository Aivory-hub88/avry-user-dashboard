import { NextRequest, NextResponse } from 'next/server'
import {
  planWorkflowFromBlueprintModule,
  validatePlannedWorkflow,
  validateN8nGraph,
  sanitizeBlueprintModuleInput,
} from '@/lib/workflows/blueprintPlanner'
import { convertToN8nWorkflow } from '@/lib/workflowConverter'
import { validateWorkflow as validateN8nWorkflow } from '@/lib/workflows/n8nMcpClient'
import { llmSemanticReview } from '@/lib/workflows/blueprintLlmValidator'

/**
 * POST /api/console/workflows/from-blueprint
 * Convert a blueprint workflow module into a draft workflow the Workflows tab
 * can open. The graph itself is planned deterministically (blueprintPlanner.ts
 * — no LLM round trip for structure/node-type decisions), then checked by
 * two independent validators before the response is returned:
 *   - n8n-MCP schema validation (deterministic, same mechanism the Copilot
 *     chat tab uses) — is every node type/parameter actually valid in n8n.
 *   - An advisory LLM audit pass (blueprintLlmValidator.ts) — a second,
 *     semantic opinion on whether any step's node choice looks wrong. This
 *     never mutates the graph, only adds warnings; it fails open if the LLM
 *     bridge is unavailable.
 * Both validators run concurrently, so this is no longer an instant
 * zero-round-trip response — it makes one n8n-MCP call and one LLM call.
 *
 * Body (from the blueprint page's per-module "Generate" button):
 *   { workflow_id, workflow_title, workflow_steps: [{type, action}],
 *     integrations_required?, trigger?, diagnostic_context?, company_name? }
 * Legacy body (older console handoff):
 *   { blueprintId, name?, context? }
 *
 * Input is sanitized (lib/workflows/blueprintPlanner.ts's
 * sanitizeBlueprintModuleInput()) before planning: step count and per-field
 * text length are capped, unknown step types are coerced to 'execution'
 * with a warning, and the request is rejected with 400 when nothing usable
 * survives — the blueprint is LLM/user-generated content reaching this
 * route over HTTP, not a trusted internal shape.
 *
 * Returns the shape the blueprint page reads:
 *   { workflow_id, title, trigger, steps: [{step, action, tool, output,
 *     type?, branches?}], integrations, estimated_time, warnings? }
 *
 * NOTE (2026-07): previously this route ONLY accepted the legacy body and
 * returned a `{ data }` stub — the blueprint page sent the module payload,
 * got `400 blueprintId is required`, and the Generate button had never
 * worked in production.
 *
 * NOTE (2026-08): previously the step→node mapping here just discarded each
 * blueprint step's `type` and emitted one flat {action, tool} entry per
 * step, which nodeMapper.ts's detectNodeIntent() would silently default to
 * an AI Agent node for anything that didn't match a narrow keyword list —
 * i.e. every blueprint essentially became Webhook → AI → AI → AI → AI.
 * lib/workflows/blueprintPlanner.ts now does real decomposition (1 business
 * step → N nodes), category-driven node selection (AI only where reasoning
 * is genuinely required), and explicit exception/human-review branches
 * instead of a bare trailing linear step.
 *
 * NOTE (2026-08): the blueprint page's "Generate" button also never sent
 * `integrations_required` to this route (only `workflow_steps`), so
 * integration resolution — CRM/email/calendar mapping, unresolved-
 * integration warnings — ran against an empty list in production even when
 * the blueprint module clearly declared its integrations. Fixed in
 * app/blueprint/page.tsx's handleGenerateWorkflow().
 */
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))

    // ── Blueprint-module payload (current caller) ───────────────────────────
    if (Array.isArray(body?.workflow_steps)) {
      const title = (body?.workflow_title ?? 'Workflow from blueprint').toString()

      // Stage 0 — input hardening. The blueprint is LLM/user-generated
      // content arriving over HTTP, not a trusted internal shape: cap size,
      // coerce unknown fields, reject outright when nothing usable survives.
      const sanitized = sanitizeBlueprintModuleInput({
        workflow_id: body?.workflow_id,
        name: title,
        trigger: body?.trigger,
        steps: body.workflow_steps,
        // Accept both the correct field name (matches BlueprintV1WorkflowModule)
        // and the legacy `integrations` alias some older callers may still send.
        integrations_required: body?.integrations_required ?? body?.integrations,
      })
      if (!sanitized.module) {
        return NextResponse.json({ error: sanitized.errors.join(' ') }, { status: 400 })
      }

      const planned = planWorkflowFromBlueprintModule(sanitized.module)

      const workflowId = (body?.workflow_id ?? `wf-${Date.now()}`).toString()
      const validation = validatePlannedWorkflow(planned)
      const warnings = [...sanitized.warnings, ...validation.warnings, ...validation.errors]

      // ── Stage 8b — graph-level connectivity check ─────────────────────────
      // Runs unconditionally (fast, local, no network) even when the
      // tree-level validator above already found errors — it catches a
      // different class of bug: an empty/placeholder branch that LOOKS fine
      // as a PlannedStep can still convert into a real dead end once
      // wired into the actual n8n graph (disconnected outputs, an
      // unexpectedly-inserted Limit node, etc.).
      const n8nWorkflow = convertToN8nWorkflow({
        workflow_id: workflowId,
        title,
        trigger: planned.trigger,
        steps: planned.steps,
        // The planner's decomposition is deliberate and bounded — never
        // insert an unrequested Limit node for a blueprint-sourced graph.
        skipAutoLimit: true,
        assumptions: planned.assumptions,
        needsClarification: planned.needsClarification,
      })
      const graphValidation = validateN8nGraph(n8nWorkflow as unknown as Parameters<typeof validateN8nGraph>[0])
      warnings.push(...graphValidation.warnings, ...graphValidation.errors)

      // ── Stage 8c/8d — schema-level + LLM semantic review ──────────────────
      // Skipped when either validator above already found errors — an
      // already-broken plan doesn't need a paid LLM call or a network round
      // trip to the n8n-MCP server to tell us it's broken. Both fail open
      // internally when they DO run (network/config errors never throw, see
      // n8nMcpClient.ts / blueprintLlmValidator.ts) and run concurrently
      // since neither depends on the other's result.
      const semanticFindings: import('@/lib/workflows/blueprintLlmValidator').SemanticFinding[] = []
      if (validation.valid && graphValidation.valid) {
        // Belt and suspenders: both validators already fail open internally
        // (see their own try/catch), but the core deterministic plan this
        // route exists to produce must NEVER be lost to an optional
        // secondary check misbehaving in a way its own contract didn't
        // anticipate — so this whole block is its own failure domain too.
        try {
          const [mcpResult, llmResult] = await Promise.all([
            validateN8nWorkflow(n8nWorkflow as unknown as Record<string, unknown>),
            llmSemanticReview(planned, title),
          ])

          if (!mcpResult.valid) {
            warnings.push(...mcpResult.errors.map((e) => `n8n schema: ${e.node}: ${e.message}`))
          }
          warnings.push(...mcpResult.warnings.map((w) => `n8n schema: ${w.node}: ${w.message}`))
          // Structured semantic findings — surfaced as a report (below) and,
          // for error-severity findings, as warnings so the user sees them.
          semanticFindings.push(...llmResult.findings)
          for (const f of llmResult.findings) {
            warnings.push(`Semantic review (${f.severity})${f.step != null ? ` step ${f.step}` : ''}: ${f.issue}${f.suggestion ? ` — ${f.suggestion}` : ''}`)
          }
        } catch (err) {
          console.warn('[from-blueprint] schema/semantic validation pass failed, returning the plan without it:', (err as Error).message)
          warnings.push('Schema/semantic validation was unavailable for this generation.')
        }
      }

      const hasSemanticErrors = semanticFindings.some((f) => f.severity === 'error')

      return NextResponse.json({
        workflow_id: workflowId,
        title,
        trigger: planned.trigger,
        steps: planned.steps,
        integrations: planned.integrations,
        estimated_time: `${Math.max(1, Math.ceil(planned.steps.length / 2))}h setup`,
        assumptions: planned.assumptions,
        needsClarification: planned.needsClarification,
        // Structured semantic review report — the "thinker" layer's verdict.
        ...(semanticFindings.length > 0 ? { semanticReview: semanticFindings } : {}),
        ...(hasSemanticErrors ? { requiresConfiguration: true } : {}),
        ...(warnings.length > 0 ? { warnings } : {}),
      })
    }

    // ── Legacy console handoff payload ──────────────────────────────────────
    const blueprintId = (body?.blueprintId ?? '').toString()
    if (!blueprintId) {
      return NextResponse.json(
        { error: 'workflow_steps or blueprintId is required' },
        { status: 400 },
      )
    }

    const now = new Date().toISOString()
    const data = {
      id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: (body?.name ?? 'Workflow from blueprint').toString(),
      source: 'blueprint',
      status: 'draft',
      blueprintId,
      description: body?.context?.description ?? undefined,
      createdAt: now,
      updatedAt: now,
    }

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create workflow from blueprint' },
      { status: 500 },
    )
  }
}
