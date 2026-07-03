/**
 * /app/api/copilot/[...path]/route.ts
 *
 * Thin HTTP wrapper over lib/workflows/bridgeCopilot.ts so BROWSER code can
 * reach the copilot operations (clarify / generate / repair / edit /
 * draft-test) without CORS — the browser never touches the VPS Bridge
 * directly.
 *
 * Server-side callers (the copilot state machine) must NOT go through this
 * route: they call callCopilotOperation() in-process, avoiding a needless
 * HTTP loop through the app's own public URL.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  callCopilotOperation,
  BridgeCopilotError,
  type CopilotOperation,
} from '@/lib/workflows/bridgeCopilot'

export const maxDuration = 120

const PATH_TO_OPERATION: Record<string, CopilotOperation> = {
  '/workflows/clarify': 'clarify',
  '/workflows/generate': 'generate',
  '/workflows/repair': 'repair',
  '/workflows/edit': 'edit',
  '/workflows/draft-test': 'draft-test',
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params
  const path = '/' + pathSegments.join('/')

  const op = PATH_TO_OPERATION[path]
  if (!op) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 })
  }

  const bodyRecord = body && typeof body === 'object' ? body as Record<string, unknown> : {}

  try {
    const result = await callCopilotOperation(op, bodyRecord)
    return NextResponse.json(result, { status: 200 })
  } catch (error: unknown) {
    if (error instanceof BridgeCopilotError) {
      console.error(`[/api/copilot${path}] upstream error`, {
        status: error.status,
        message: error.message.slice(0, 300),
      })
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`[/api/copilot${path}] error`, msg)
    return NextResponse.json({ message: msg }, { status: 502 })
  }
}
