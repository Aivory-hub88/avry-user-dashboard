"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { collabAuthHeaders } from "@/lib/collabClient"

type DocItem = { id: string; title: string; workspace_id: string; owner: string | null; updated_at: string | null; myRole: string }

export default function WorkspacePage() {
  const [docs, setDocs] = useState<DocItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const router = useRouter()

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/workspace', { headers: collabAuthHeaders() })
      if (r.ok) {
        const j = await r.json()
        setDocs(j.docs ?? [])
      }
    } catch {}
    setLoading(false)
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [])

  const create = async () => {
    if (creating) return
    setCreating(true)
    try {
      const r = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...collabAuthHeaders() },
        body: JSON.stringify({ title: title.trim() || 'Untitled' }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok && j.id) router.push(`/workspace/${j.id}`)
      else load()
    } catch {}
    setCreating(false)
  }

  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-6">
        <span className="text-[13px] font-medium leading-none text-white/80">Workspace</span>
        <div className="flex items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New doc title"
            className="w-[180px] rounded-full border border-line bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/80 placeholder:text-white/30 outline-none"
          />
          <button onClick={create} disabled={creating} className="rounded-full bg-white px-4 py-1.5 text-[12px] font-medium text-black hover:bg-white/90 disabled:opacity-50">
            {creating ? 'Creating…' : 'New doc'}
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[860px] flex-1 overflow-y-auto px-8 py-8">
        <div className="rounded-[16px] border border-line bg-white/[0.03] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[13px] font-medium text-white/80">Your documents</h2>
            <span className="text-[11px] text-white/30">{loading ? 'loading…' : `${docs.length} docs`}</span>
          </div>

          {loading ? (
            <div className="py-8 text-center text-[12px] text-white/30">Loading…</div>
          ) : docs.length === 0 ? (
            <div className="py-8 text-center">
              <div className="text-[13px] text-white/40">No documents yet</div>
              <div className="mt-2 text-[11px] text-white/25">Create your first doc or ask an agent to create one</div>
              <div className="mt-4 flex justify-center gap-2">
                <button onClick={create} className="rounded-full bg-white px-4 py-2 text-[12px] font-medium text-black">Create doc</button>
                <Link href="/workspace/demo" className="rounded-full border border-line bg-white/[0.04] px-4 py-2 text-[12px] text-white/60">Open demo</Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {docs.map((d) => (
                <Link
                  key={d.id}
                  href={`/workspace/${d.id}`}
                  className="flex items-center justify-between rounded-xl border border-transparent bg-white/[0.02] px-4 py-3 hover:border-line hover:bg-white/[0.04]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-white/80">{d.title || d.id}</div>
                    <div className="mt-0.5 text-[11px] text-white/30">
                      {d.id} · {d.myRole} {d.updated_at ? `· ${new Date(d.updated_at).toLocaleDateString()}` : ''}
                    </div>
                  </div>
                  <span className="ml-3 shrink-0 rounded-full bg-white/[0.06] px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-white/40">
                    {d.myRole}
                  </span>
                </Link>
              ))}
            </div>
          )}

          <div className="mt-6 flex justify-center">
            <Link href="/workspace/demo" className="text-[11px] text-white/30 underline-offset-4 hover:underline">
              Open demo page →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
