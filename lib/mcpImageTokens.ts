/**
 * Download credentials for Aivory's own first-party, self-hosted MCP server
 * images (e.g. `od-mcp`, the Odoo MCP server — see
 * docs/CERVEAU-ODOO-INTEGRATION-PLAN.md). These images are proprietary and
 * not published to any public registry, so a tenant who wants to self-host
 * one needs an authenticated download token rather than `docker pull`.
 *
 * Backend: avry-backend /api/v1/mcp-image-tokens (JWT) and
 * /api/v1/mcp-images/{image}/download (X-Aivory-Download-Key, used from the
 * tenant's own infrastructure, never from this dashboard).
 */

import { authedFetch } from './deployAuth'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

export interface McpImageToken {
  id: string
  image_name: string
  key_prefix: string
  label: string | null
  status: 'active' | 'revoked'
  last_pulled_at: string | null
  created_at: string
}

export interface CreatedMcpImageToken {
  id: string
  token: string // plaintext — shown exactly once, never returned by any other call
  key_prefix: string
  label: string | null
  image_name: string
  created_at: string
}

async function parseErrorAndThrow(res: Response): Promise<never> {
  const detail = await res.json().then((d) => d?.detail).catch(() => null)
  throw new Error(
    typeof detail === 'string' ? detail : `Request failed (${res.status})`
  )
}

export async function listMcpImageTokens(imageName?: string): Promise<McpImageToken[]> {
  const qs = imageName ? `?image_name=${encodeURIComponent(imageName)}` : ''
  const res = await authedFetch(`${BACKEND_URL}/api/v1/mcp-image-tokens${qs}`)
  if (!res.ok) return parseErrorAndThrow(res)
  const data = await res.json()
  return data.tokens as McpImageToken[]
}

export async function createMcpImageToken(imageName: string, label?: string): Promise<CreatedMcpImageToken> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/mcp-image-tokens`, {
    method: 'POST',
    body: JSON.stringify({ image_name: imageName, label: label || undefined }),
  })
  if (!res.ok) return parseErrorAndThrow(res)
  return res.json()
}

export async function revokeMcpImageToken(id: string): Promise<void> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/mcp-image-tokens/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) return parseErrorAndThrow(res)
}
