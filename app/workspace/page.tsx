"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { collabAuthHeaders } from "@/lib/collabClient"
import WorkspaceBell from "@/components/workspace/WorkspaceBell"
import WorkspacePagesList from "@/components/workspace/WorkspacePagesList"

type LandingDoc = { id: string; isProject?: boolean }
type SearchHit = { kind: "doc" | "row"; doc_id: string; doc_title: string; row_id?: string; title: string; snippet: string }

export default function WorkspacePage() {
  const [landingDocs, setLandingDocs] = useState<LandingDoc[]>([])
  const [landingLoading, setLandingLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [q, setQ] = useState('')
  const [topError, setTopError] = useState<string | null>(null)
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const router = useRouter()
  const search = useSearchParams()
  // Sub-page dokumen: ?view=pages mematikan smart landing (tetap tampil list).
  const wantPages = search.get("view") === "pages"

  // Unified search (docs + task rows, server-ranked) — debounced.
  useEffect(() => {
    const needle = q.trim()
    if (needle.length < 2) {
      setHits(null)
      return
    }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/workspace/search?q=${encodeURIComponent(needle)}&limit=8`, { headers: collabAuthHeaders() })
        if (r.ok) {
          const j = await r.json()
          setHits(Array.isArray(j.hits) ? j.hits : [])
        } else {
          setHits(null)
        }
      } catch {
        setHits(null)
      }
      setSearching(false)
    }, 350)
    return () => clearTimeout(t)
  }, [q])

  const goHit = (h: SearchHit) => {
    setHits(null)
    router.push(h.kind === "row" ? `/workspace/${h.doc_id}?view=database` : `/workspace/${h.doc_id}`)
  }

  // Landing decision: cukup id + isProject (list detail diurus komponen).
  useEffect(() => {
    let alive = true
    fetch('/api/workspace', { headers: collabAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return
        setLandingDocs(Array.isArray(j?.docs) ? j.docs : [])
        setLandingLoading(false)
      })
      .catch(() => {
        if (!alive) return
        setLandingDocs([])
        setLandingLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  // Smart landing: klik Workspace langsung masuk ruang discussion project
  // terbaru (list API sudah urut updated_at DESC). replace (bukan push)
  // supaya tombol back tidak memantul. Tanpa project / ?view=pages →
  // tetap tampil list dokumen sebagai sub-page.
  const topProject = landingDocs.find((d) => d.isProject) ?? null
  useEffect(() => {
    if (wantPages || landingLoading) return
    if (topProject) router.replace(`/workspace/${topProject.id}?view=discussion`)
  }, [wantPages, landingLoading, topProject, router])

  const create = async (asProject = false) => {
    if (creating) return
    setCreating(true)
    setTopError(null)
    try {
      const r = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...collabAuthHeaders() },
        body: JSON.stringify({ title: title.trim() || (asProject ? 'Untitled project' : 'Untitled') }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok && j.id) {
        if (asProject) {
          try {
            await fetch(`/api/workspace/${j.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', ...collabAuthHeaders() },
              body: JSON.stringify({ props: { isProject: true, projectDocs: [] } }),
            })
          } catch {}
          router.push(`/workspace/${j.id}?view=discussion`)
        } else {
          router.push(`/workspace/${j.id}`)
        }
      }
      else if (r.status === 401) {
        setTopError('Your session has expired. Sign in again to create.')
      } else setTopError(j.error === 'db' ? 'Your page could not be created. Please try again.' : 'Your page could not be created.')
    } catch { setTopError('We could not connect to your workspace. Please try again.') }
    setCreating(false)
  }

  if (!wantPages && (landingLoading || topProject)) {
    return (
      <div className="flex h-full w-full flex-col bg-surface-1">
        <div className="flex h-12 shrink-0 items-center border-b border-line bg-black/10 px-6 text-[13px] font-medium leading-none text-white/80">My workspace</div>
        <div className="flex flex-1 items-center justify-center text-[13px] text-white/30">
          {landingLoading ? "Loading…" : "Opening discussion…"}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line bg-black/10 px-6">
        <span className="shrink-0 text-[13px] font-medium leading-none text-white/80">My workspace</span>
        <div className="relative flex min-w-0 flex-1 items-center justify-end gap-2">
          <WorkspaceBell />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hits && hits.length > 0) goHit(hits[0])
              if (e.key === "Escape") setHits(null)
            }}
            placeholder="Search docs & tasks"
            className="hidden w-[160px] rounded-full border border-line bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/80 placeholder:text-white/30 outline-none sm:block"
          />
          {hits !== null && (
            <div className="absolute right-0 top-full z-30 mt-2 w-[320px] rounded-2xl border border-line bg-[#1e1e1c] p-2 shadow-2xl">
              {searching ? (
                <div className="px-3 py-3 text-center text-[12px] text-white/30">Searching…</div>
              ) : hits.length === 0 ? (
                <div className="px-3 py-3 text-center text-[12px] text-white/30">No matches for “{q.trim()}”.</div>
              ) : (
                hits.map((h, i) => (
                  <button
                    key={`${h.kind}:${h.doc_id}:${h.row_id ?? ""}:${i}`}
                    onClick={() => goHit(h)}
                    className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/[0.06]"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${h.kind === "row" ? "bg-sky-500/15 text-sky-300" : "bg-white/[0.08] text-white/60"}`}>
                        {h.kind === "row" ? "task" : "page"}
                      </span>
                      <span className="truncate text-[12px] font-medium text-white/80">{h.title}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-white/35">{h.doc_title}{h.snippet && h.snippet !== h.title ? ` · ${h.snippet}` : ""}</div>
                  </button>
                ))
              )}
            </div>
          )}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') create() }}
            placeholder="Page title"
            className="w-[140px] rounded-full border border-line bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/80 placeholder:text-white/30 outline-none sm:w-[180px]"
          />
          <button onClick={() => create()} disabled={creating} className="shrink-0 rounded-full bg-white px-4 py-1.5 text-[12px] font-medium text-black hover:bg-white/90 disabled:opacity-50">
             {creating ? 'Creating…' : 'New page'}
          </button>
          <button onClick={() => create(true)} disabled={creating} title="Create a project board across docs" className="shrink-0 rounded-full border border-line bg-white/[0.04] px-4 py-1.5 text-[12px] font-medium text-white/70 hover:bg-white/[0.08] hover:text-white disabled:opacity-50">
             New project
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[860px] flex-1 overflow-y-auto bg-black/10 px-8 py-8">
        {topError && (
          <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">{topError}</div>
        )}
        {wantPages && topProject && (
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => router.push(`/workspace/${topProject.id}?view=discussion`)}
              className="rounded-full bg-white/[0.06] px-3 py-1.5 text-[12px] text-white/60 hover:bg-white/[0.1] hover:text-white/85"
            >
              → Back to discussion
            </button>
          </div>
        )}
        <WorkspacePagesList query={q} />
      </div>
    </div>
  )
}
