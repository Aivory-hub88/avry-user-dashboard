"use client"

import { useParams, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useEffect, useState } from "react"
import WorkspaceEditor from "@/components/workspace/WorkspaceEditor"
import WorkspaceDatabase from "@/components/workspace/WorkspaceDatabase"
import SharingPanel from "@/components/workspace/SharingPanel"
import { collabAuthHeaders } from "@/lib/collabClient"

type Meta = {
  id: string
  workspace_id: string
  owner: string | null
  ownerEmail: string | null
  ownerName: string | null
  title: string
  myRole: string | null
  myRequest: { id: string; status: string; role_requested: string } | null
}

export default function WorkspaceDocPage() {
  const params = useParams()
  const search = useSearchParams()
  const id = (params?.id as string) ?? "demo"
  const view = search.get("view") === "database" ? "database" : "page"

  const [meta, setMeta] = useState<Meta | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'locked' | 'unauth'>('loading')
  const [reqRole, setReqRole] = useState<'viewer' | 'editor'>('viewer')
  const [reqMsg, setReqMsg] = useState<string | null>(null)

  const loadMeta = async () => {
    try {
      const r = await fetch(`/api/workspace/${id}/meta`, { headers: collabAuthHeaders() })
      if (r.status === 401) { setStatus('unauth'); return }
      if (r.status === 403) { setStatus('locked'); 
        const j = await r.json().catch(()=>({}))
        // try to still get owner info via 403 body? fallback
        return
      }
      if (r.ok) {
        const j = (await r.json()) as Meta
        setMeta(j)
        setStatus('ok')
      } else setStatus('locked')
    } catch { setStatus('locked') }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadMeta() }, [id])

  // for locked, fetch owner info via separate? meta already 403, so need owner via other means
  // we show generic locked; request access still works
  const requestAccess = async () => {
    setReqMsg(null)
    const r = await fetch(`/api/workspace/${id}/request-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...collabAuthHeaders() },
      body: JSON.stringify({ role: reqRole }),
    })
    const j = await r.json().catch(()=>({}))
    if (r.ok) { setReqMsg('Request sent — owner will review'); loadMeta() }
    else setReqMsg(j.error ?? 'failed')
  }

  if (status === 'loading') {
    return <div className="flex h-full items-center justify-center bg-surface-1 text-[13px] text-white/30">Loading…</div>
  }
  if (status === 'unauth') {
    return (
      <div className="flex h-full w-full flex-col bg-surface-1">
        <div className="flex h-12 items-center border-b border-line px-6 text-[13px] text-white/40">Workspace / {id}</div>
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="w-full max-w-[520px] rounded-2xl border border-line bg-white/[0.03] p-8 text-center">
            <div className="text-[15px] font-medium text-white/80">Sign in required</div>
            <div className="mt-2 text-[13px] leading-relaxed text-white/40">Please sign in to view this workspace document.</div>
            <Link href="/login" className="mt-6 inline-block rounded-full bg-white px-5 py-2 text-[13px] font-medium text-black">Go to login</Link>
          </div>
        </div>
      </div>
    )
  }
  if (status === 'locked') {
    const pending = meta?.myRequest?.status === 'pending'
    return (
      <div className="flex h-full w-full flex-col bg-surface-1">
        <div className="flex h-12 items-center justify-between border-b border-line px-6">
          <div className="flex items-center gap-2">
            <Link href="/workspace" className="text-[13px] text-white/40 hover:text-white/70">Workspace</Link>
            <span className="text-white/20">/</span>
            <span className="text-[13px] font-medium text-white/80">{id}</span>
          </div>
          <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-amber-300">No access</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center p-8">
          <div className="w-full max-w-[520px] rounded-2xl border border-line bg-white/[0.03] p-8 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-300">◨</div>
            <div className="mt-3 text-[15px] font-medium text-white/80">You don’t have access to this doc</div>
            <div className="mt-2 text-[13px] leading-relaxed text-white/40">
              {meta?.ownerEmail ? <>Owner: <span className="text-white/70">{meta.ownerName ?? meta.ownerEmail}</span> — request access below</> : 'Ask the owner to invite you, or request access.'}
            </div>
            {pending ? (
              <div className="mt-6 rounded-xl bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">Request pending — {meta?.myRequest?.role_requested} access awaiting approval</div>
            ) : (
              <div className="mt-6 flex items-center justify-center gap-2">
                <select value={reqRole} onChange={e=>setReqRole(e.target.value as any)} className="rounded-full border border-line bg-white/[0.04] px-3 py-2 text-[12px] text-white/70">
                  <option value="viewer">viewer</option>
                  <option value="editor">editor</option>
                </select>
                <button onClick={requestAccess} className="rounded-full bg-white px-5 py-2 text-[13px] font-medium text-black hover:bg-white/90">Request access</button>
              </div>
            )}
            {reqMsg && <div className="mt-3 text-[11px] text-white/50">{reqMsg}</div>}
            <div className="mt-6">
              <Link href="/workspace" className="text-[12px] text-white/30 underline-offset-4 hover:underline">← Back to workspace</Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const isOwner = meta?.myRole === 'owner'
  const canWrite = meta?.myRole === 'owner' || meta?.myRole === 'editor'

  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-6">
        <div className="flex items-center gap-2">
          <Link href="/workspace" className="text-[13px] text-white/40 hover:text-white/70">
            Workspace
          </Link>
          <span className="text-white/20">/</span>
          <span className="text-[13px] font-medium text-white/80">{meta?.title ?? id}</span>
          <span className="ml-2 rounded-full bg-white/[0.06] px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-white/40">{meta?.myRole}</span>
          {!canWrite && <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-amber-300">read-only</span>}
          <div className="ml-3 flex items-center gap-1 rounded-full bg-white/[0.04] p-1">
            <Link
              href={`/workspace/${id}`}
              className={`rounded-full px-3 py-1 text-[12px] ${view === "page" ? "bg-white text-black" : "text-white/40 hover:text-white/70"}`}
            >
              Page
            </Link>
            <Link
              href={`/workspace/${id}?view=database`}
              className={`rounded-full px-3 py-1 text-[12px] ${view === "database" ? "bg-white text-black" : "text-white/40 hover:text-white/70"}`}
            >
              Database
            </Link>
          </div>
        </div>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
          {canWrite ? 'BlockSuite' : 'Viewer'}
        </span>
      </div>
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="mx-auto w-full max-w-[860px] flex-1 overflow-y-auto px-8 py-8">
          {view === "database" ? <WorkspaceDatabase docId={id} /> : <WorkspaceEditor docId={id} />}
          {!canWrite && (
            <div className="mx-auto mt-6 max-w-[720px] rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">
              You have viewer access — edits are read-only and won’t be saved.
            </div>
          )}
        </div>
        <div className="w-full shrink-0 border-t border-line p-4 lg:w-[360px] lg:border-l lg:border-t-0">
          <SharingPanel docId={id} isOwner={!!isOwner} />
          {meta?.ownerEmail && (
            <div className="mt-3 text-[11px] text-white/30">Owner: {meta.ownerName ?? meta.ownerEmail}</div>
          )}
        </div>
      </div>
    </div>
  )
}
