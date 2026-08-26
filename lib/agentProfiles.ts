/**
 * Agent identity profiles + credit balance client.
 *
 * Each user can give every prebuilt agent its own identity (agent name,
 * business name, tone, knowledge/FAQ, extra instructions); the agent runtime
 * injects it into the system prompt per request. Credits meter agent LLM
 * usage per tier and reset monthly.
 * Backend: avry-backend /api/v1/agent-profiles + /api/v1/credits (JWT).
 */

import { authedFetch } from './deployAuth'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

export interface AgentProfile {
  agent_name?: string | null
  business_name?: string | null
  tone?: string | null
  language_pref?: string | null
  business_description?: string | null
  knowledge?: string | null
  custom_instructions?: string | null
  greeting?: string | null
  updated_at?: string | null
}

export async function getAgentProfile(agentType: string): Promise<AgentProfile | null> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/agent-profiles/${agentType}`)
  if (!res.ok) throw new Error(`Failed to load profile (${res.status})`)
  const data = await res.json()
  return data?.profile ?? null
}

export async function saveAgentProfile(agentType: string, profile: AgentProfile): Promise<void> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/agent-profiles/${agentType}`, {
    method: 'PUT',
    body: JSON.stringify(profile),
  })
  if (!res.ok) throw new Error(`Failed to save profile (${res.status})`)
}

export async function resetAgentProfile(agentType: string): Promise<void> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/agent-profiles/${agentType}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`Failed to reset profile (${res.status})`)
}

export interface KnowledgeDocumentResult {
  knowledge: string
  truncated: boolean
  extracted_chars: number
}

/** Extracts text from a document and returns it merged into the current
 *  knowledge field -- doesn't save by itself, saveAgentProfile still does. */
export async function uploadKnowledgeDocument(
  agentType: string,
  file: File,
): Promise<KnowledgeDocumentResult> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await authedFetch(`${BACKEND_URL}/api/v1/agent-profiles/${agentType}/knowledge/document`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const detail = await res.json().then((d) => d?.detail).catch(() => null)
    throw new Error(detail || `Failed to process document (${res.status})`)
  }
  return res.json()
}

export interface CreditStatus {
  unlimited: boolean
  tier: string
  balance: number | null
  allowance: number | null
}

export async function getCredits(): Promise<CreditStatus | null> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/credits`)
  if (!res.ok) return null
  return res.json()
}
