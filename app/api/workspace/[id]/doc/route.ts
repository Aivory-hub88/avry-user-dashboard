import { NextRequest, NextResponse } from "next/server"

// In-memory Yjs update store for Phase A POC (replace with Postgres workspace_docs in next iteration)
// This lives per Next.js server instance — survives HMR but not container restart. Good enough to verify Yjs flow.
const store = globalThis as unknown as { __aivory_ws_store?: Map<string, Uint8Array> }
if (!store.__aivory_ws_store) store.__aivory_ws_store = new Map<string, Uint8Array>()
const mem = store.__aivory_ws_store!

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const update = mem.get(id)
  if (!update) return new NextResponse(null, { status: 404 })
  return new NextResponse(update as unknown as BodyInit, {
    status: 200,
    headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" },
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const buf = await req.arrayBuffer()
  if (!buf.byteLength) return NextResponse.json({ error: "empty" }, { status: 400 })
  mem.set(id, new Uint8Array(buf))
  return NextResponse.json({ id, updated_at: new Date().toISOString(), bytes: buf.byteLength })
}
