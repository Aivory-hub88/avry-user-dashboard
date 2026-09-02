/**
 * White-Box Memory — what an agent remembers about the user, surfaced for
 * review/edit/delete. Backend: avry-backend /api/v1/agent-memory (JWT),
 * which proxies Cerveau's tenant-scoped GET/PUT/DELETE /webhook/memory
 * endpoints. Mirrors agentApprovals.ts's shape/conventions exactly.
 *
 * This is the zeroclaw-memory key/value store (categories core/daily/
 * conversation/document) — a short, human-reviewable fact or note, not the
 * separate cognee-rs graph memory, which has no browse surface at all.
 */

import { authedFetch } from './deployAuth'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

export type MemoryCategory = 'core' | 'daily' | 'conversation' | string

export interface MemoryEntry {
  id: string
  key: string
  content: string
  category: MemoryCategory
  timestamp: string
  /** Present on rows returned by the list endpoint — required to edit/delete
   *  without avry-backend re-scanning every (instance, agent_type) pair. */
  _gateway_base?: string
  _agent_type?: string
}

export async function listMemory(): Promise<MemoryEntry[]> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/agent-memory`)
  if (!res.ok) throw new Error(`Failed to load memory (${res.status})`)
  const data = await res.json()
  return data.entries ?? []
}

/** Same list, grouped by `_agent_type` — 'unknown' for any row missing it. */
export async function listMemoryByAgent(): Promise<Record<string, MemoryEntry[]>> {
  const entries = await listMemory()
  return entries.reduce<Record<string, MemoryEntry[]>>((acc, e) => {
    const key = e._agent_type ?? 'unknown'
    ;(acc[key] ??= []).push(e)
    return acc
  }, {})
}

export async function editMemory(
  entry: Pick<MemoryEntry, 'key' | '_gateway_base' | '_agent_type'>,
  content: string,
): Promise<MemoryEntry> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/agent-memory/${encodeURIComponent(entry.key)}`, {
    method: 'PUT',
    body: JSON.stringify({
      content,
      gateway_base: entry._gateway_base ?? null,
      agent_type: entry._agent_type ?? null,
    }),
  })
  if (!res.ok) throw new Error(`Failed to save memory (${res.status})`)
  const data = await res.json()
  return data.entry
}

export async function deleteMemory(
  entry: Pick<MemoryEntry, 'key' | '_gateway_base' | '_agent_type'>,
): Promise<void> {
  const params = new URLSearchParams()
  if (entry._gateway_base) params.set('gateway_base', entry._gateway_base)
  if (entry._agent_type) params.set('agent_type', entry._agent_type)
  const qs = params.toString()
  const res = await authedFetch(
    `${BACKEND_URL}/api/v1/agent-memory/${encodeURIComponent(entry.key)}${qs ? `?${qs}` : ''}`,
    { method: 'DELETE' },
  )
  if (!res.ok) throw new Error(`Failed to delete memory (${res.status})`)
}

/** 4096-char server-side truncation (Cerveau's own display cap) — content
 *  ending exactly at that boundary may not be the entry's real full text,
 *  so the edit UI should say so rather than silently save a shortened
 *  version as if it were complete. */
export function looksTruncated(content: string): boolean {
  return content.endsWith('...') && content.length >= 4096
}

const CATEGORY_LABEL: Record<string, string> = {
  core: 'Core fact',
  daily: 'Daily note',
  conversation: 'Conversation',
  document: 'Document',
}

export function describeCategory(category: string): string {
  return CATEGORY_LABEL[category] ?? category.replace(/^\w/, (c) => c.toUpperCase())
}
