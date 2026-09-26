"use client"

/**
 * /workspace/[id] — a room (ADR-019 P5).
 *
 * Rooms open as the Console-style room (Chat / Tasks / Notes). The old
 * Notion-style pages and project Discussion view are gone: any other doc id
 * shows a short "no longer available" note. Old links keep working where
 * they can: ?view=database / ?view=board open the room's Tasks tab.
 */
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import RoomView from "@/components/room/RoomView"
import type { RoomBrief } from "@/components/room/RoomPanel"
import { clearClientAuthSession, collabAuthHeaders } from "@/lib/collabClient"
import { getMarketingUrl } from "@/lib/config"
import { useWorkspaceContext } from "@/contexts/WorkspaceContext"

type Meta = {
  id: string
  workspace_id: string
  title: string
  ownerEmail: string | null
  ownerName: string | null
  props: Record<string, unknown>
  deleted_at: string | null
  myRole: "owner" | "editor" | "viewer" | null
  myRequest: { id: string; status: string; role_requested: string } | null
}

type Status = "loading" | "ok" | "locked" | "unauth"

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <div className="flex h-12 shrink-0 items-center border-b border-line bg-black/10 px-6 text-[13px]">
        <Link href="/workspace" className="text-white/40 hover:text-white/70">
          Workspace
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-[480px] rounded-2xl border border-line bg-white/[0.02] p-8 text-center">{children}</div>
      </div>
    </div>
  )
}

export default function WorkspaceRoomPage() {
  const { id } = useParams<{ id: string }>()
  const search = useSearchParams()
  const router = useRouter()
  const { setActiveWorkspaceId } = useWorkspaceContext()
  const [meta, setMeta] = useState<Meta | null>(null)
  const [status, setStatus] = useState<Status>("loading")
  const [reqRole, setReqRole] = useState<"viewer" | "editor">("editor")
  const [reqMsg, setReqMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/workspace/${id}/meta`, { headers: collabAuthHeaders() })
      if (r.status === 401) {
        clearClientAuthSession()
        setStatus("unauth")
        return
      }
      if (!r.ok) {
        setStatus("locked")
        return
      }
      setMeta((await r.json()) as Meta)
      setStatus("ok")
    } catch {
      setStatus("locked")
    }
  }, [id])

  useEffect(() => {
    // Fetch on mount; load() only sets state after its await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const isRoom = meta?.props?.isRoom === true && !meta.deleted_at

  // Console intents ("add a task") act on the room you last opened.
  useEffect(() => {
    if (status === "ok" && isRoom) setActiveWorkspaceId(id)
  }, [id, isRoom, setActiveWorkspaceId, status])

  // Old ?view=database|board links → the room's Tasks tab.
  const legacyView = search.get("view")
  useEffect(() => {
    if (isRoom && (legacyView === "database" || legacyView === "board")) router.replace(`/workspace/${id}?tab=tasks`)
  }, [id, isRoom, legacyView, router])

  const requestAccess = async () => {
    setReqMsg(null)
    const r = await fetch(`/api/workspace/${id}/request-access`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
      body: JSON.stringify({ role: reqRole }),
    })
    const j = (await r.json().catch(() => ({}))) as { error?: string }
    if (r.ok) setReqMsg("Request sent. The room owner will review it.")
    else setReqMsg(j.error ?? "That request couldn't be sent.")
  }

  if (status === "loading") return <div className="flex h-full items-center justify-center bg-surface-1 text-[13px] text-white/30">Loading…</div>

  if (status === "unauth")
    return (
      <Frame>
        <div className="text-[15px] font-medium text-white/80">Sign in required</div>
        <div className="mt-2 text-[13px] text-white/40">Sign in to open this room.</div>
        <a href={`${getMarketingUrl()}/login`} className="mt-6 inline-block rounded-full bg-white px-5 py-2 text-[13px] font-medium text-black">
          Go to sign in
        </a>
      </Frame>
    )

  if (status === "locked")
    return (
      <Frame>
        <div className="text-[15px] font-medium text-white/80">You don&apos;t have access to this room</div>
        <div className="mt-2 text-[13px] text-white/40">Ask the room owner to add you, or request access.</div>
        <div className="mt-6 flex items-center justify-center gap-2">
          <select
            value={reqRole}
            onChange={(e) => setReqRole(e.target.value as "viewer" | "editor")}
            aria-label="Access to request"
            className="rounded-full border border-line bg-white/[0.04] px-3 py-2 text-[12px] text-white/70"
          >
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <button type="button" onClick={requestAccess} className="rounded-full bg-white px-5 py-2 text-[13px] font-medium text-black transition-transform duration-150 ease-out active:scale-[0.97]">
            Request access
          </button>
        </div>
        {reqMsg && <div className="mt-3 text-[12px] text-white/50">{reqMsg}</div>}
      </Frame>
    )

  if (!isRoom)
    return (
      <Frame>
        <div className="text-[15px] font-medium text-white/80">This page is no longer available</div>
        <div className="mt-2 text-[13px] leading-relaxed text-white/40">
          Workspace is now made of rooms. Projects start as a request; once approved, the team and its agents work together in the room.
        </div>
        <Link href="/workspace" className="mt-6 inline-block rounded-full bg-white px-5 py-2 text-[13px] font-medium text-black">
          Go to Workspace
        </Link>
      </Frame>
    )

  const autonomy = meta?.props?.autonomy
  return (
    <RoomView
      roomId={id}
      title={meta?.title ?? "Room"}
      workspaceId={meta?.workspace_id ?? null}
      brief={meta?.props?.brief && typeof meta.props.brief === "object" ? (meta.props.brief as RoomBrief) : null}
      requestId={typeof meta?.props?.requestId === "string" ? meta.props.requestId : null}
      canWrite={meta?.myRole === "owner" || meta?.myRole === "editor"}
      isOwner={meta?.myRole === "owner"}
      autonomy={autonomy === "observe" || autonomy === "act" ? autonomy : "suggest"}
    />
  )
}
