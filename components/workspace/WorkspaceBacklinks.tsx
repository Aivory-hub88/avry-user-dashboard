"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Link2, ArrowLeftRight, Plus, Trash2 } from "lucide-react"
import { collabAuthHeaders } from "@/lib/collabClient"

type DocBrief = { id: string; title: string }
type LinkRow = { src: string; dst: string; created_at: string }

export default function WorkspaceBacklinks({ docId, canWrite }: { docId: string; canWrite: boolean }) {
  const [outgoing, setOutgoing] = useState<LinkRow[]>([])
  const [incoming, setIncoming] = useState<LinkRow[]>([])
  const [docs, setDocs] = useState<DocBrief[]>([])
  const [picked, setPicked] = useState("")
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const r = await fetch(`/api/workspace/${docId}/links`, { headers: collabAuthHeaders() })
      if (r.ok) {
        const j = await r.json()
        setOutgoing(j.outgoing ?? [])
        setIncoming(j.incoming ?? [])
      }
    } catch {}
    try {
      const r = await fetch("/api/workspace", { headers: collabAuthHeaders() })
      if (r.ok) {
        const j = await r.json()
        setDocs((j.docs ?? []).map((d: { id: string; title: string }) => ({ id: d.id, title: d.title })))
      }
    } catch {}
  }

  useEffect(() => { void load() }, [docId])

  const addLink = async () => {
    const dst = picked.trim()
    if (!dst || busy || !canWrite) return
    setBusy(true)
    try {
      const r = await fetch(`/api/workspace/${docId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
        body: JSON.stringify({ dst }),
      })
      if (r.ok) {
        setPicked("")
        await load()
      }
    } catch {}
    setBusy(false)
  }

  const removeLink = async (dst: string) => {
    if (!canWrite) return
    try {
      await fetch(`/api/workspace/${docId}/links`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
        body: JSON.stringify({ dst }),
      })
      await load()
    } catch {}
  }

  const titleOf = (id: string) => docs.find((d) => d.id === id)?.title || id

  const candidates = docs.filter((d) => d.id !== docId && !outgoing.some((l) => l.dst === d.id))

  return (
    <div className="mx-auto w-full max-w-[960px] rounded-2xl border border-line bg-white/[0.025] p-4">
      <div className="flex items-center gap-2 text-[12px] font-medium text-white/60">
        <ArrowLeftRight className="h-3.5 w-3.5" /> Bi-directional links
        <span className="text-[11px] font-normal text-white/25">· {outgoing.length} outgoing · {incoming.length} backlinks</span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/30">
            <Link2 className="h-3 w-3" /> Linked to
          </div>
          {outgoing.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 py-4 text-center text-[11px] text-white/25">No links yet</div>
          ) : (
            <div className="flex flex-col gap-1">
              {outgoing.map((l) => (
                <div key={l.dst} className="flex items-center justify-between rounded-xl border border-line bg-white/[0.03] px-3 py-2">
                  <Link href={`/workspace/${l.dst}`} className="truncate text-[12px] text-white/70 hover:text-white">
                    {titleOf(l.dst)}
                  </Link>
                  {canWrite && (
                    <button onClick={() => removeLink(l.dst)} className="rounded-full p-1 text-white/30 hover:bg-white/[0.06] hover:text-white/60">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {canWrite && candidates.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5">
              <select value={picked} onChange={(e) => setPicked(e.target.value)} className="flex-1 rounded-full border border-line bg-white/[0.04] px-3 py-2 text-[12px] text-white/70 outline-none">
                <option value="">Link to…</option>
                {candidates.slice(0, 20).map((d) => (
                  <option key={d.id} value={d.id}>{d.title || d.id}</option>
                ))}
              </select>
              <button onClick={addLink} disabled={!picked || busy} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-[12px] font-medium text-black hover:bg-white/90 disabled:opacity-40">
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
          )}
        </div>

        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-wider text-white/30">Backlinks</div>
          {incoming.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 py-4 text-center text-[11px] text-white/25">No backlinks yet</div>
          ) : (
            <div className="flex flex-col gap-1">
              {incoming.map((l) => (
                <Link key={l.src} href={`/workspace/${l.src}`} className="rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-[12px] text-white/70 hover:bg-white/[0.04] hover:text-white">
                  {titleOf(l.src)}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
