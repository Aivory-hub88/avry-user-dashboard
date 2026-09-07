"use client"

import { useParams } from "next/navigation"
import Link from "next/link"

export default function WorkspaceDocPage() {
  const params = useParams()
  const id = (params?.id as string) ?? "demo"

  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-6">
        <div className="flex items-center gap-2">
          <Link href="/workspace" className="text-[13px] text-white/40 hover:text-white/70">
            Workspace
          </Link>
          <span className="text-white/20">/</span>
          <span className="text-[13px] font-medium text-white/80">{id}</span>
        </div>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
          BlockSuite POC
        </span>
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="mx-auto w-full max-w-[760px] flex-1 overflow-y-auto px-8 py-10">
          <div className="rounded-[16px] border border-dashed border-white/10 bg-white/[0.02] p-8">
            <h1 className="text-[22px] font-medium text-white/90">Page: {id}</h1>
            <p className="mt-2 text-[13px] text-white/40">
              Placeholder for BlockSuite Yjs editor. Next iteration mounts{" "}
              <code className="rounded bg-white/[0.06] px-1.5 py-0.5">@blocksuite/store</code> +{" "}
              <code className="rounded bg-white/[0.06] px-1.5 py-0.5">y-websocket</code>.
            </p>
            <div className="mt-6 rounded-xl border border-line bg-[#353531] p-4 font-mono text-[12px] leading-relaxed text-white/60">
              <div className="text-white/80">// TODO: mount editor</div>
              <div>import &#123; Doc &#125; from &apos;yjs&apos;</div>
              <div>import &#123; BlockSuiteEditor &#125; from &apos;@/components/workspace/BlockSuiteEditor&apos;</div>
            </div>
            <div className="mt-4 text-[12px] text-white/30">
              Yjs sync: <code className="rounded bg-white/[0.06] px-1.5 py-0.5">host.docker.internal:3200</code> ·
              API: <code className="rounded bg-white/[0.06] px-1.5 py-0.5">/api/workspace/[id]/doc</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
