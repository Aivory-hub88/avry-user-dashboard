"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { FileText, Plus, Search } from "lucide-react"
import { collabAuthHeaders } from "@/lib/collabClient"

type DocItem = {
  id: string
  title: string
  updated_at: string | null
  myRole: string
}

export default function WorkspaceNavigator({ currentId }: { currentId: string }) {
  const router = useRouter()
  const [docs, setDocs] = useState<DocItem[]>([])
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let alive = true
    fetch("/api/workspace", { headers: collabAuthHeaders() })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (alive) setDocs(payload?.docs ?? [])
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [currentId])

  const createDocument = async () => {
    if (creating) return
    setCreating(true)
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
        body: JSON.stringify({ title: "Untitled" }),
      })
      const payload = await response.json().catch(() => ({}))
      if (response.ok && payload.id) router.push(`/workspace/${payload.id}`)
    } catch {}
    setCreating(false)
  }

  const filtered = docs.filter((doc) => {
    const needle = query.trim().toLowerCase()
    return !needle || doc.title.toLowerCase().includes(needle) || doc.id.toLowerCase().includes(needle)
  })

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-line bg-black/10 lg:min-h-0 lg:w-[232px] lg:overflow-hidden lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/35">Pages</div>
          <div className="mt-1 text-[12px] text-white/55">Your workspace</div>
        </div>
        <button
          onClick={createDocument}
          disabled={creating}
          title="New page"
          className="rounded-lg p-1.5 text-white/35 hover:bg-white/[0.06] hover:text-white/80 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <label className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-line bg-white/[0.03] px-2.5 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-white/25" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a page"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-white/75 outline-none placeholder:text-white/25"
        />
      </label>
      <nav className="flex max-h-[180px] flex-row gap-1 overflow-x-auto px-3 pb-3 lg:min-h-0 lg:max-h-none lg:flex-col lg:overflow-y-auto lg:pb-4">
        {filtered.map((doc) => (
          <Link
            key={doc.id}
            href={`/workspace/${doc.id}`}
            className={`flex min-w-[170px] items-center gap-2 rounded-lg px-2.5 py-2 text-left transition lg:min-w-0 ${
              doc.id === currentId ? "bg-white/[0.08] text-white/90" : "text-white/45 hover:bg-white/[0.04] hover:text-white/75"
            }`}
          >
            <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <span className="min-w-0 flex-1 truncate text-[12px]">{doc.title || doc.id}</span>
            {doc.id === currentId && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" />}
          </Link>
        ))}
        {filtered.length === 0 && <div className="px-2.5 py-3 text-[11px] text-white/25">No pages found</div>}
      </nav>
    </aside>
  )
}
