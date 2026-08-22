/**
 * API-key toolkit connect — Composio Integration
 *
 * POST /api/integrations/apikey/connect
 *   { toolkit: 'erpnext', fields: { full, generic_api_key, generic_token } }
 *   → Creates a Composio connected account for the current user with
 *     custom API-key credentials (no OAuth popup exists for this scheme).
 *
 * Only toolkits explicitly listed in SUPPORTED_API_KEY_TOOLKITS are accepted
 * — the auth config id is server-side constant, never client-supplied.
 *
 * Error contract mirrors app/api/integrations/oauth/route.ts:
 *   401 { error: { code: 'UNAUTHENTICATED', ... } }
 *   400 { error: { code: 'BAD_REQUEST',    ... } }
 *   500 { error: { code: 'COMPOSIO_ERROR', ... } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveIntegrationUser } from '@/lib/integration-auth'

// docs/CERVEAU-ERP-INTEGRATION-PLAN.md Phase 3 — Aivory-owned custom auth
// config (scheme API_KEY, not Composio-managed). Tenant supplies their own
// Frappe instance URL + API key/secret (Frappe User Settings → API Access).
const ERPNEXT_AUTH_CONFIG_ID = 'ac_ILn9zmSA5cqN'

const SUPPORTED_API_KEY_TOOLKITS: Record<string, { authConfigId: string; requiredFields: string[] }> = {
  erpnext: {
    authConfigId: ERPNEXT_AUTH_CONFIG_ID,
    requiredFields: ['full', 'generic_api_key', 'generic_token'],
  },
}

function errorResponse(status: 400 | 401 | 403 | 500, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await resolveIntegrationUser(req)
  if (!auth.ok) {
    return errorResponse(auth.status, auth.code, auth.message)
  }

  const body = await req.json().catch(() => null)
  const toolkit = typeof body?.toolkit === 'string' ? body.toolkit : null
  const spec = toolkit ? SUPPORTED_API_KEY_TOOLKITS[toolkit] : undefined
  if (!spec) {
    return errorResponse(400, 'BAD_REQUEST', `Unsupported or unknown toolkit: ${String(toolkit ?? '(none)')}`)
  }

  const fields = body?.fields
  if (!fields || typeof fields !== 'object') {
    return errorResponse(400, 'BAD_REQUEST', 'Missing connection fields')
  }
  const missing = spec.requiredFields.filter(
    (f) => !fields[f] || typeof fields[f] !== 'string' || !fields[f].trim(),
  )
  if (missing.length > 0) {
    return errorResponse(400, 'BAD_REQUEST', `Missing required fields: ${missing.join(', ')}`)
  }

  const composioKey = process.env.COMPOSIO_API_KEY
  if (!composioKey) {
    return errorResponse(500, 'COMPOSIO_ERROR', 'Composio is not configured on this deployment')
  }

  try {
    // Payload shape verified live against the v3 API (2026-08-22): for a
    // custom API_KEY auth config, per-connection credentials go inside
    // `connection.data` keyed by the auth config's expected_input_fields
    // names (`full` / `generic_api_key` / `generic_token`).
    const res = await fetch('https://backend.composio.dev/api/v3/connected_accounts', {
      method: 'POST',
      headers: {
        'x-api-key': composioKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auth_config: { id: spec.authConfigId },
        connection: {
          entity_id: auth.userId,
          status: 'ACTIVE',
          data: Object.fromEntries(
            spec.requiredFields.map((f) => [f, (fields[f] as string).trim()]),
          ),
        },
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      let message = `Composio rejected the connection (${res.status})`
      try {
        const parsed = JSON.parse(detail)
        if (parsed?.error?.message) message = String(parsed.error.message)
      } catch {
        /* keep generic */
      }
      return errorResponse(400, 'COMPOSIO_ERROR', message)
    }

    const created = (await res.json()) as { id?: string }
    return NextResponse.json({
      success: true,
      data: { connectedAccountId: created.id ?? null },
    })
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: { code: 'COMPOSIO_ERROR', message: 'Failed to create the connection', details } },
      { status: 500 },
    )
  }
}
