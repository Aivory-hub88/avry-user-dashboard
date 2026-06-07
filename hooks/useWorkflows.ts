'use client'

const STORAGE_KEY = 'aivory_workflows'

export interface SavedWorkflow {
  workflow_id: string
  title: string
  status: 'draft' | 'active' | 'archived'
  source: 'blueprint' | 'n8n'
  blueprint_version?: string
  company_name: string
  created_at: string
  trigger: string
  steps: Array<{
    step: number
    action: string
    tool: string
    output: string
    type?: string
    appId?: string
    connectionId?: string
    config?: {
      integration?: string
      url?: string
      method?: string
      apiKey?: string
      additionalFields?: string
    }
    credentials?: {
      name?: string
    }
  }>
  integrations: string[]
  estimated_time: string
  automation_percentage: string
  error_handling?: string
  notes?: string
  // Source identifiers
  blueprintId?: string
  n8nId?: string
  // n8n activation data
  n8n_workflow_id?: string
  n8n_url?: string
  n8nWebhookPath?: string | null
}

export function loadWorkflows(): SavedWorkflow[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    
    const workflows = JSON.parse(raw) as SavedWorkflow[]
    
    // Normalize workflows in memory: if it has n8nId but legacy source 'blueprint',
    // treat it as n8n-backed so it uses the new editor
    const normalized = workflows.map((wf) => {
      if (wf.n8nId && wf.source === 'blueprint') {
        return { ...wf, source: 'n8n' as const }
      }
      return wf
    })
    
    return normalized
  } catch {
    return []
  }
}

export function saveWorkflow(wf: SavedWorkflow): string {
  const existing = loadWorkflows()
  const sameId = existing.filter(w => w.workflow_id === wf.workflow_id || w.workflow_id.startsWith(wf.workflow_id + '-v'))
  let finalId = wf.workflow_id
  if (sameId.length > 0) {
    finalId = `${wf.workflow_id}-v${sameId.length + 1}`
  }
  const toSave = { ...wf, workflow_id: finalId }
  existing.push(toSave)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('aivory_workflows_updated'))
  }
  return finalId
}

export function updateWorkflow(workflow_id: string, updates: Partial<SavedWorkflow>): void {
  const existing = loadWorkflows()
  const idx = existing.findIndex(w => w.workflow_id === workflow_id)
  if (idx !== -1) {
    existing[idx] = { ...existing[idx], ...updates }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))
  }
}

export function deleteWorkflow(workflow_id: string): void {
  const existing = loadWorkflows().filter(w => w.workflow_id !== workflow_id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))
}

export function getWorkflowCount(): number {
  return loadWorkflows().length
}

// ── API-backed hooks ─────────────────────────────────────
// These replace localStorage for the main workflows page.
// The localStorage helpers above are kept for backward compatibility
// (Blueprint page still uses saveWorkflow / loadWorkflows).

import { useEffect, useState, useCallback } from 'react'
import type { AivoryWorkflowSpec } from '@/types/workflow'

/** Fetch all workflows from the API. */
export function useWorkflowList() {
  const [workflows, setWorkflows] = useState<AivoryWorkflowSpec[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/workflows')
      if (!res.ok) throw new Error(`Failed to load workflows: ${res.status}`)
      const data = await res.json()
      setWorkflows(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { workflows, loading, error, refresh }
}

/** Create a new workflow via POST /api/workflows. Returns the created spec. */
export async function createWorkflow(
  data: Partial<AivoryWorkflowSpec>
): Promise<AivoryWorkflowSpec> {
  const res = await fetch('/api/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `Create failed: ${res.status}`)
  }
  return res.json()
}

/** Partially update a workflow via PATCH /api/workflows/:id. */
export async function patchWorkflow(
  id: string,
  patch: Partial<AivoryWorkflowSpec>
): Promise<AivoryWorkflowSpec> {
  const res = await fetch(`/api/workflows/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `Update failed: ${res.status}`)
  }
  return res.json()
}

/** Delete a workflow via DELETE /api/workflows/:id. */
export async function removeWorkflow(id: string): Promise<void> {
  const res = await fetch(`/api/workflows/${id}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Delete failed: ${res.status}`)
  }
}

/** Activate a workflow via POST /api/workflows/:id/activate. Returns updated spec. */
export async function activateWorkflow(id: string, spec?: AivoryWorkflowSpec): Promise<AivoryWorkflowSpec> {
  const res = await fetch(`/api/workflows/${id}/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Send the full spec so the server can recover if the in-memory store was reset
    body: JSON.stringify(spec ? { spec } : {}),
  })
  if (!res.ok) {
    let payload: Record<string, string> = {}
    try { payload = await res.json() } catch { /* ignore */ }
    // Prefer `details` (raw n8n message) over the generic `error` code
    const message = payload?.details || payload?.error || `Activation failed (${res.status})`
    throw new Error(message)
  }
  return res.json()
}

/** Deactivate a workflow via POST /api/workflows/:id/deactivate. Returns updated spec. */
export async function deactivateWorkflow(id: string): Promise<AivoryWorkflowSpec> {
  const res = await fetch(`/api/workflows/${id}/deactivate`, { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `Deactivation failed: ${res.status}`)
  }
  return res.json()
}
