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
  const [q, setQ] = useState('')
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

  const filtered = docs.filter((d) => {
    const needle = q.trim().toLowerCase()
    if (!needle) return true
    return (d.title || '').toLowerCase().includes(needle) || d.id.toLowerCase().includes(needle)
  })

  const roleBadge = (role: string) =>
    role === 'owner'
      ? 'bg-emerald-500/15 text-emerald-300'
      : role === 'editor'
        ? 'bg-sky-500/15 text-sky-300'
        : 'bg-amber-500/15 text-amber-300'

  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-6">
        <span className="shrink-0 text-[13px] font-medium leading-none text-white/80">My workspace</span>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a page"
            className="hidden w-[160px] rounded-full border border-line bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/80 placeholder:text-white/30 outline-none sm:block"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') create() }}
            placeholder="Page title"
            className="w-[140px] rounded-full border border-line bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/80 placeholder:text-white/30 outline-none sm:w-[180px]"
          />
          <button onClick={create} disabled={creating} className="shrink-0 rounded-full bg-white px-4 py-1.5 text-[12px] font-medium text-black hover:bg-white/90 disabled:opacity-50">
             {creating ? 'Creating…' : 'New page'}
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[860px] flex-1 overflow-y-auto px-8 py-8">
        <div className="rounded-[16px] border border-line bg-white/[0.03] p-6">
          <div className="mb-4 flex items-center justify-between">
             <h2 className="text-[13px] font-medium text-white/80">Your pages</h2>
            <span className="text-[11px] text-white/30">{loading ? 'loading…' : `${filtered.length} of ${docs.length}`}</span>
          </div>

          {loading ? (
            <div className="py-8 text-center text-[12px] text-white/30">Loading…</div>
          ) : docs.length === 0 ? (
            <div className="py-8 text-center">
               <div className="text-[13px] text-white/40">Nothing here yet</div>
               <div className="mt-2 text-[11px] text-white/25">Create a page for a note, task list, or idea.</div>
              <div className="mt-4 flex justify-center">
                 <button onClick={create} className="rounded-full bg-white px-4 py-2 text-[12px] font-medium text-black">Create your first page</button>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-white/30">No documents match “{q.trim()}”.</div>
          ) : (
            <div className="flex flex-col gap-1">
              {filtered.map((d) => (
                <Link
                  key={d.id}
                  href={`/workspace/${d.id}`}
                  className="flex items-center justify-between rounded-xl border border-transparent bg-white/[0.02] px-4 py-3 hover:border-line hover:bg-white/[0.04]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-white/80">{d.title || d.id}</div>
                    <div className="mt-0.5 text-[11px] text-white/30">
                      {d.updated_at ? new Date(d.updated_at).toLocaleDateString() : '—'}
                    </div>
                  </div>
                  <span className={`ml-3 shrink-0 rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-wider ${roleBadge(d.myRole)}`}>
                    {d.myRole}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
