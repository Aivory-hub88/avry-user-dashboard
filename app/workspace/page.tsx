"use client"

import Link from "next/link"

/**
 * POC placeholder for AFFiNE-style Workspace.
 * Real editor is BlockSuite (Yjs) in app/workspace/[id]/page.tsx.
 * See docs/AFFINE-WORKSPACE-ADOPTION.md.
 */
export default function WorkspacePage() {
  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <div className="flex h-12 shrink-0 items-center border-b border-line px-6">
        <span className="text-[13px] font-medium leading-none text-white/80">Workspace</span>
        <span className="ml-2 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
          POC
        </span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-8 py-12">
        <div className="w-full max-w-[640px] rounded-[20px] border border-line bg-white/[0.03] p-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-white/60">
            <span className="text-lg">◨</span>
          </div>
          <h1 className="text-[18px] font-medium text-white/90">Aivory Workspace</h1>
          <p className="mx-auto mt-2 max-w-[420px] text-[13px] leading-relaxed text-white/40">
            Notion-like Pages + Database (Table / Kanban / Calendar) backed by BlockSuite Yjs.
            Agents will create and operate pages here, surfaced in Mission Control.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Link
              href="/workspace/demo"
              className="rounded-full bg-white px-4 py-2 text-[13px] font-medium text-black transition hover:bg-white/90"
            >
              Open demo page
            </Link>
            <Link
              href="/console"
              className="rounded-full border border-line bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-white/70 transition hover:bg-white/[0.08]"
            >
              Back to Console
            </Link>
          </div>
          <p className="mt-4 text-[11px] text-white/25">
            Spec: <code className="rounded bg-white/[0.06] px-1.5 py-0.5">docs/AFFINE-WORKSPACE-ADOPTION.md</code>
          </p>
        </div>
      </div>
    </div>
  )
}
