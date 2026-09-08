"use client"

import { useEffect, useState } from 'react'
import { collabAuthHeaders } from '@/lib/collabClient'

type AclRow = { user_id: string; role: string; email?: string; full_name?: string }
type ReqRow = { id: string; requester_id: string; requester_email?: string; user_email?: string; full_name?: string; role_requested: string; status: string; created_at: string }

export default function SharingPanel({ docId, isOwner }: { docId: string; isOwner: boolean }) {
  const [acl, setAcl] = useState<AclRow[]>([])
  const [requests, setRequests] = useState<ReqRow[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer')
  const [msg, setMsg] = useState<string | null>(null)

  const load = async () => {
    try {
      const r1 = await fetch(`/api/workspace/${docId}/acl`, { headers: collabAuthHeaders() })
      if (r1.ok) {
        const j = await r1.json()
        setAcl(j.grants ?? [])
      }
    } catch {}
    if (isOwner) {
      try {
        const r2 = await fetch(`/api/workspace/${docId}/requests`, { headers: collabAuthHeaders() })
        if (r2.ok) {
          const j = await r2.json()
          setRequests((j.requests ?? []).filter((x: ReqRow) => x.status === 'pending'))
        }
      } catch {}
    }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [docId])

  const invite = async () => {
    if (!email.trim()) return
    setMsg(null)
    const r = await fetch(`/api/workspace/${docId}/acl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...collabAuthHeaders() },
      body: JSON.stringify({ email: email.trim(), role }),
    })
    const j = await r.json().catch(() => ({}))
    if (r.ok) {
      setMsg(`Invited ${email} as ${role}`)
      setEmail('')
      load()
    } else setMsg(j.error ?? 'failed')
  }

  const act = async (reqId: string, action: 'approve' | 'deny') => {
    const r = await fetch(`/api/workspace/${docId}/requests/${reqId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...collabAuthHeaders() },
      body: JSON.stringify({ action }),
    })
    if (r.ok) load()
  }

  if (!isOwner) {
    return (
      <div className="rounded-xl border border-line bg-white/[0.03] p-4">
        <div className="text-[12px] font-medium text-white/70">Shared with</div>
        <div className="mt-2 text-[12px] text-white/40">
          {acl.length === 0 ? 'Only owner has access' : `${acl.length} collaborator(s)`}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-line bg-white/[0.03] p-4">
      <div className="text-[13px] font-medium text-white/80">Share</div>
      <div className="mt-3 flex gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@aivory.id"
          className="flex-1 rounded-full border border-line bg-white/[0.04] px-3 py-1.5 text-[13px] text-white/80 placeholder:text-white/30 outline-none"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as any)}
          className="rounded-full border border-line bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/70"
        >
          <option value="viewer">viewer</option>
          <option value="editor">editor</option>
        </select>
        <button onClick={invite} className="rounded-full bg-white px-4 py-1.5 text-[12px] font-medium text-black hover:bg-white/90">
          Invite
        </button>
      </div>
      {msg && <div className="mt-2 text-[11px] text-white/50">{msg}</div>}

      <div className="mt-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-white/30">Access</div>
        <div className="mt-2 flex flex-col gap-1">
          {acl.length === 0 ? (
            <div className="text-[12px] text-white/30">No additional collaborators</div>
          ) : (
            acl.map((a) => (
              <div key={a.user_id} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2">
                <span className="text-[12px] text-white/70">{a.email ?? a.user_id}</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/60">{a.role}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {requests.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-white/30">Requests</div>
          <div className="mt-2 flex flex-col gap-1">
            {requests.map((rq) => (
              <div key={rq.id} className="flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-2">
                <span className="text-[12px] text-white/80">
                  {rq.user_email ?? rq.requester_email ?? rq.requester_id} wants {rq.role_requested}
                </span>
                <span className="flex gap-1">
                  <button onClick={() => act(rq.id, 'approve')} className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-black">Approve</button>
                  <button onClick={() => act(rq.id, 'deny')} className="rounded-full border border-white/20 px-3 py-1 text-[11px] text-white/70">Deny</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
