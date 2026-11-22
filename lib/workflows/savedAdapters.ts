import type { AivoryWorkflowSpec } from '@/types/workflow'
import type { SavedWorkflow } from '@/hooks/useWorkflows'

// ── Adapter: AivoryWorkflowSpec → SavedWorkflow ──────────
// Lets the canvas/editor work with either shape.
export function specToSaved(spec: AivoryWorkflowSpec): SavedWorkflow {
  return {
    workflow_id: spec.id,
    title: spec.title,
    status: spec.status,
    source: spec.source,
    company_name: spec.company_name,
    trigger: spec.trigger,
    steps: spec.steps,
    integrations: spec.integrations,
    estimated_time: spec.estimated_time,
    automation_percentage: spec.automation_percentage,
    error_handling: spec.error_handling,
    notes: spec.notes,
    blueprintId: spec.blueprintId,
    n8nId: spec.n8nId,
    n8n_workflow_id: spec.n8n_workflow_id,
    n8n_url: spec.n8n_url,
    // Without these two the canvas loses the instance hint after every list
    // refresh and reads an Aivory-test-instance workflow with the user's BYO
    // key (n8n answers 401).
    n8nWebhookPath: spec.n8nWebhookPath,
    n8n_instance: spec.n8n_instance,
    created_by: spec.created_by,
    access: spec.access,
    created_at: spec.createdAt,
  }
}

export function savedToSpec(wf: SavedWorkflow): Partial<AivoryWorkflowSpec> {
  return {
    title: wf.title,
    status: wf.status,
    source: wf.source,
    company_name: wf.company_name,
    trigger: wf.trigger,
    steps: wf.steps,
    integrations: wf.integrations,
    estimated_time: wf.estimated_time,
    automation_percentage: wf.automation_percentage,
    error_handling: wf.error_handling,
    notes: wf.notes,
    blueprintId: wf.blueprintId,
    n8nId: wf.n8nId,
    n8n_workflow_id: wf.n8n_workflow_id,
    n8n_url: wf.n8n_url,
    n8nWebhookPath: wf.n8nWebhookPath,
    n8n_instance: wf.n8n_instance,
  }
}
