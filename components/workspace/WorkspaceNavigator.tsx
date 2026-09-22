"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState, type ReactNode } from "react"
import { ChevronDown, ChevronRight, FileText, Plus, Search, Trash2, X } from "lucide-react"
import { collabAuthHeaders } from "@/lib/collabClient"
import { useWorkspaceAwareness } from "@/hooks/useWorkspaceAwareness"
import { AGENT_ROSTER } from "@/lib/agentRoster"

type DocItem = {
  id: string
  title: string
  updated_at: string | null
  myRole: string
  isProject?: boolean
}

type TopicItem = {
  root: string
  title: string
}

type MemberUser = {
  id: string
  email: string | null
  name: string | null
  role: string
}

type MemberAgent = {
  type: string
  role: string
}

function memberLabel(u: MemberUser): string {
  return u.name || u.email || u.id
}

function agentLabel(type: string): string {
  return AGENT_ROSTER.find((a) => a.type === type)?.name ?? type
}

const ROLE_PILL: Record<string, string> = {
  owner: "bg-emerald-500/15 text-emerald-300",
  editor: "bg-sky-500/15 text-sky-300",
  viewer: "bg-white/[0.07] text-white/45",
  agent: "border border-violet-500/30 bg-violet-500/20 text-violet-200",
}

/**
 * RailSection — grup rail kiri yang collapsible ala AI console (chevron +
 * ingat status buka/tutup per grup di localStorage).
 */
function RailSection({
  storageKey,
  title,
  action,
  defaultCollapsed = false,
  children,
}: {
  storageKey: string
  title: string
  action?: ReactNode
  defaultCollapsed?: boolean
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      if (typeof window === "undefined") return defaultCollapsed
      return window.localStorage.getItem(`aivory_rail_${storageKey}`) === "1"
    } catch {
      return defaultCollapsed
    }
  })
  const toggle = () => {
    setCollapsed((v) => {
      const next = !v
      try {
        window.localStorage.setItem(`aivory_rail_${storageKey}`, next ? "1" : "0")
      } catch {
        // abaikan — tetap jalan tanpa persist
      }
      return next
    })
  }
  return (
    <div className="border-b border-line px-4 pb-3 pt-4">
      <div className="flex items-center gap-1">
        <button
          onClick={toggle}
          aria-expanded={!collapsed}
          title={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-0.5 text-left text-[11px] font-medium uppercase tracking-[0.16em] text-white/35 hover:text-white/60"
        >
          {collapsed ? <ChevronRight className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
          <span className="truncate">{title}</span>
        </button>
        {action}
      </div>
      {!collapsed && <div className="mt-2">{children}</div>}
    </div>
  )
}

export default function WorkspaceNavigator({
  currentId,
  spaceId,
  workspaceId,
  spaceFiles,
}: {
  currentId: string
  spaceId?: string | null
  workspaceId?: string | null
  spaceFiles?: string[]
}) {
  const router = useRouter()
  const peers = useWorkspaceAwareness(spaceId ? (workspaceId ?? null) : null)
  const [docs, setDocs] = useState<DocItem[]>([])
  const [topics, setTopics] = useState<TopicItem[]>([])
  const [owner, setOwner] = useState<MemberUser | null>(null)
  const [memberUsers, setMemberUsers] = useState<MemberUser[]>([])
  const [memberAgents, setMemberAgents] = useState<MemberAgent[]>([])
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

  // Team Space: Discussions rail — topic rows dari stream Space ini.
  useEffect(() => {
    if (!spaceId) return
    let alive = true
    fetch(`/api/workspace/${spaceId}/stream?limit=50`, { headers: collabAuthHeaders() })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!alive || !Array.isArray(payload?.roots)) return
        setTopics(
          payload.roots
            .filter((r: { topic?: { archived?: boolean } | null }) => r.topic && !r.topic.archived)
            .map((r: { id: string; topic: { title: string } }) => ({ root: r.id, title: r.topic.title })),
        )
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [spaceId])

  // Team Space: rail MEMBERS — owner + grants + agent grants Space ini.
  const loadMembers = useCallback(async () => {
    if (!spaceId) return
    try {
      const response = await fetch(`/api/workspace/${spaceId}/members`, { headers: collabAuthHeaders() })
      const payload = response.ok ? await response.json().catch(() => null) : null
      if (!payload) return
      setOwner(payload.owner ?? null)
      setMemberUsers(Array.isArray(payload.users) ? payload.users : [])
      setMemberAgents(Array.isArray(payload.agents) ? payload.agents : [])
    } catch {}
  }, [spaceId])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMembers()
  }, [loadMembers])

  // Invite team member langsung dari rail (epic: + di header MEMBERS).
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"viewer" | "editor">("editor")
  const [inviteMsg, setInviteMsg] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)

  const inviteMember = useCallback(async () => {
    const email = inviteEmail.trim()
    if (!spaceId || !email || inviting) return
    setInviting(true)
    setInviteMsg(null)
    try {
      const r = await fetch(`/api/workspace/${spaceId}/acl`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
        body: JSON.stringify({ email, role: inviteRole }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok) {
        setInviteMsg(`Invited ${email} as ${inviteRole}`)
        setInviteEmail("")
        void loadMembers()
      } else {
        setInviteMsg(typeof j?.error === "string" ? j.error : "Could not invite (owner only?)")
      }
    } catch {
      setInviteMsg("Could not invite. Try again.")
    }
    setInviting(false)
  }, [spaceId, inviteEmail, inviteRole, inviting, loadMembers])

  const createDocument = async () => {
    if (creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
        body: JSON.stringify({ title: "Untitled" }),
      })
      const payload = await response.json().catch(() => ({}))
      if (response.ok && payload.id) router.push(`/workspace/${payload.id}`)
      else setCreateError(response.status === 401 ? "Sign in required" : "Could not create page")
    } catch { setCreateError("Could not create page") }
    setCreating(false)
  }

  const removeDoc = async (event: React.MouseEvent, docId: string) => {
    event.preventDefault()
    event.stopPropagation()
    if (deletingId) return
    setDeletingId(docId)
    try {
      const response = await fetch(`/api/workspace/${docId}`, { method: "DELETE", headers: collabAuthHeaders() })
      if (response.ok) {
        setDocs((prev) => prev.filter((doc) => doc.id !== docId))
        // The active page is gone — back to the pages list, never a dead doc.
        if (docId === currentId) router.push("/workspace?view=pages")
      } else {
        setCreateError(response.status === 401 ? "Sign in required" : "Could not delete page")
      }
    } catch {
      setCreateError("Could not delete page")
    }
    setDeletingId(null)
    setConfirmDeleteId(null)
  }

  const filtered = docs.filter((doc) => {
    const needle = query.trim().toLowerCase()
    return !needle || doc.title.toLowerCase().includes(needle) || doc.id.toLowerCase().includes(needle)
  })

  const titleOf = (id: string): string => docs.find((d) => d.id === id)?.title || id
  const spaces = docs.filter((d) => d.isProject)
  const files = (spaceFiles ?? []).map((id) => ({ id, title: titleOf(id) }))
  const peerNames = new Set(peers.map((p) => p.name.toLowerCase()))

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-line bg-black/10 lg:min-h-0 lg:w-[232px] lg:overflow-hidden lg:border-b-0 lg:border-r">
      {spaceId && (
        <>
          <RailSection storageKey="space" title="Space">
            <div className="flex flex-col gap-0.5">
              {spaces.map((s) => (
                <Link
                  key={s.id}
                  href={`/workspace/${s.id}?view=discussion`}
                  className={`truncate rounded-lg px-2.5 py-1.5 text-left text-[12px] ${
                    s.id === spaceId
                      ? "bg-white/[0.08] font-medium text-white/90"
                      : "text-white/45 hover:bg-white/[0.04] hover:text-white/75"
                  }`}
                >
                  {s.title || s.id}
                  {s.id === spaceId && files.length > 0 && (
                    <span className="ml-1.5 text-[11px] font-normal text-white/35">
                      {files.length} files
                    </span>
                  )}
                </Link>
              ))}
              {spaces.length === 0 && (
                <span className="px-2.5 py-1 text-[11px] text-white/25">No spaces yet</span>
              )}
            </div>
          </RailSection>
          <RailSection storageKey="discussions" title="Discussions">
            <div className="flex flex-col gap-0.5">
            {topics.map((t) => (
              <Link
                key={t.root}
                href={`/workspace/${spaceId}?view=discussion&thread=${t.root}`}
                className="truncate rounded-lg px-2.5 py-1.5 text-left text-[12px] text-white/45 hover:bg-white/[0.04] hover:text-white/75"
              >
                {t.title}
              </Link>
            ))}
            {topics.length === 0 && (
              <Link
                href={`/workspace/${spaceId}?view=discussion`}
                className="rounded-lg px-2.5 py-1.5 text-left text-[12px] text-white/25 hover:bg-white/[0.04] hover:text-white/60"
              >
                Open discussion →
              </Link>
            )}
            </div>
          </RailSection>
          <RailSection storageKey="files" title="Files">
            <div className="flex flex-col gap-0.5">
              {files.map((f) => (
                <Link
                  key={f.id}
                  href={`/workspace/${f.id}`}
                  className="truncate rounded-lg px-2.5 py-1.5 text-left text-[12px] text-white/45 hover:bg-white/[0.04] hover:text-white/75"
                >
                  {f.title}
                </Link>
              ))}
              {files.length === 0 && (
                <span className="px-2.5 py-1 text-[11px] text-white/25">No files yet</span>
              )}
            </div>
          </RailSection>
          <RailSection
            storageKey="members"
            title="Members"
            action={
              <button
                onClick={() => setShowInvite((v) => !v)}
                title={showInvite ? "Close invite" : "Invite team member"}
                aria-label={showInvite ? "Close invite" : "Invite team member"}
                className="rounded-md p-1 text-white/35 hover:bg-white/[0.06] hover:text-white/80"
              >
                {showInvite ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              </button>
            }
          >
            {showInvite && (
              <div className="mb-2 rounded-xl border border-line bg-white/[0.03] p-2.5">
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void inviteMember()
                    if (e.key === "Escape") setShowInvite(false)
                  }}
                  placeholder="teammate@aivory.id"
                  aria-label="Teammate email"
                  className="w-full rounded-lg border border-line bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-white/80 outline-none placeholder:text-white/25 focus:border-white/20"
                />
                <div className="mt-1.5 flex gap-1.5">
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as "viewer" | "editor")}
                    aria-label="Invite role"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-white/[0.04] px-2 py-1.5 text-[12px] text-white/70"
                  >
                    <option value="editor">editor</option>
                    <option value="viewer">viewer</option>
                  </select>
                  <button
                    onClick={() => void inviteMember()}
                    disabled={inviting || !inviteEmail.trim()}
                    className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-[12px] font-medium text-black hover:bg-white/90 disabled:opacity-40"
                  >
                    {inviting ? "…" : "Invite"}
                  </button>
                </div>
                {inviteMsg && <div className="mt-1.5 text-[11px] text-white/50">{inviteMsg}</div>}
              </div>
            )}
            <div className="flex flex-col gap-1">
              {owner && (
                <div className="flex items-center gap-2 px-2.5 py-1">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-white/75">
                    {memberLabel(owner)}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${ROLE_PILL.owner}`}>
                    Owner
                  </span>
                </div>
              )}
              {memberUsers.map((u) => {
                const online = peerNames.has(memberLabel(u).toLowerCase())
                return (
                  <div key={u.id} className="flex items-center gap-2 px-2.5 py-1">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${online ? "bg-emerald-400" : "bg-white/20"}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-white/60">
                      {memberLabel(u)}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${ROLE_PILL[u.role] ?? ROLE_PILL.viewer}`}>
                      {u.role}
                    </span>
                  </div>
                )
              })}
              {memberAgents.map((a) => (
                <div key={a.type} className="flex items-center gap-2 px-2.5 py-1">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-white/60">
                    {agentLabel(a.type)}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${ROLE_PILL.agent}`}>
                    Agent
                  </span>
                </div>
              ))}
              {!owner && memberUsers.length === 0 && memberAgents.length === 0 && (
                <span className="px-2.5 py-1 text-[11px] text-white/25">Just you</span>
              )}
            </div>
          </RailSection>
        </>
      )}
      <RailSection
        storageKey="mypages"
        title="My pages"
        action={
          <button
            onClick={createDocument}
            disabled={creating}
            title="Create a new page"
            className="rounded-md p-1 text-white/35 hover:bg-white/[0.06] hover:text-white/80 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        }
      >
        <div className="mb-2 px-2.5 text-[12px] text-white/55">Notes, tasks, and ideas</div>
        <label className="mb-2 flex items-center gap-2 rounded-lg border border-line bg-white/[0.03] px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-white/25" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a page"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-white/75 outline-none placeholder:text-white/25"
          />
        </label>
        {createError && <div className="mb-2 rounded-lg bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200">{createError}</div>}
        <nav className="flex max-h-[180px] flex-row gap-1 overflow-x-auto pb-1 lg:min-h-0 lg:max-h-none lg:flex-col lg:overflow-y-auto lg:pb-2">
        {filtered.map((doc) => (
          <div
            key={doc.id}
            className={`group/navrow flex min-w-[170px] items-center gap-1 rounded-lg px-2.5 py-2 transition lg:min-w-0 ${
              doc.id === currentId ? "bg-white/[0.08] text-white/90" : "text-white/45 hover:bg-white/[0.04] hover:text-white/75"
            }`}
          >
            <Link
              href={`/workspace/${doc.id}`}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
              <span className="min-w-0 flex-1 truncate text-[12px]">{doc.title || doc.id}</span>
              {doc.id === currentId && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" />}
            </Link>
            {doc.myRole === "owner" && (
              confirmDeleteId === doc.id ? (
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={(event) => removeDoc(event, doc.id)}
                    disabled={deletingId === doc.id}
                    title="Confirm delete"
                    className="rounded bg-red-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-red-500 disabled:opacity-50"
                  >
                    {deletingId === doc.id ? "…" : "Yes"}
                  </button>
                  <button
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setConfirmDeleteId(null)
                    }}
                    title="Cancel"
                    className="rounded px-1 py-0.5 text-[10px] text-white/50 hover:text-white/80"
                  >
                    No
                  </button>
                </span>
              ) : (
                <button
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setConfirmDeleteId(doc.id)
                  }}
                  title="Delete this page"
                  className="shrink-0 rounded p-1 text-white/25 opacity-0 hover:bg-white/[0.06] hover:text-red-300 focus:opacity-100 group-hover/navrow:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )
            )}
          </div>
        ))}
        {filtered.length === 0 && <div className="px-2.5 py-3 text-[11px] text-white/25">No pages found</div>}
        </nav>
      </RailSection>
    </aside>
  )
}
