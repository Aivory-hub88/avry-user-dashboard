"use client"

/**
 * One header for the Workspace section: title, the four sections as tabs
 * (Rooms, Requests, Timeline, Teams), "How it works" and "New request".
 * Rendered by app/workspace/layout.tsx, so it stays mounted while you switch
 * tabs instead of each page drawing its own bar.
 *
 * Page-specific actions go through window events, so a page that is already
 * open reacts in place (no reload); from another tab they navigate.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { CircleHelp, Plus } from "lucide-react"
import { requestsApi, teamsApi } from "@/lib/requestsClient"

export const WORKSPACE_GUIDE_EVENT = "aivory:workspace-guide"
export const WORKSPACE_NEW_REQUEST_EVENT = "aivory:workspace-new-request"
export const WORKSPACE_NEW_ROOM_EVENT = "aivory:workspace-new-room"

export const WORKSPACE_TABS = [
  { href: "/workspace", label: "Rooms", tour: "rooms-tab" },
  { href: "/workspace/requests", label: "Requests", tour: "requests" },
  { href: "/workspace/timeline", label: "Timeline", tour: "timeline" },
  { href: "/workspace/teams", label: "Teams", tour: "teams" },
] as const

/** Paths that show this header (room and request detail pages have their own). */
export function isWorkspaceSection(pathname: string | null): boolean {
  return WORKSPACE_TABS.some((t) => t.href === pathname)
}

export default function WorkspaceNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [canRequest, setCanRequest] = useState(false)
  const [owns, setOwns] = useState(false)
  const [waiting, setWaiting] = useState(0)

  // Refresh on every tab switch: a team created on Teams or a request
  // reviewed on Requests should show up in the badge and button right away.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const teams = await teamsApi.list()
        const owns = teams.some((t) => t.role === "owner")
        const inbox = owns ? await requestsApi.list("inbox") : []
        if (cancelled) return
        setCanRequest(teams.some((t) => t.role === "owner" || t.role === "editor"))
        setOwns(owns)
        setWaiting(inbox.filter((r) => r.status === "submitted").length)
      } catch {
        // The page below shows its own error; the header just stays plain.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pathname])

  const openGuide = () => {
    if (pathname === "/workspace") window.dispatchEvent(new Event(WORKSPACE_GUIDE_EVENT))
    else router.push("/workspace?guide=1")
  }
  const newRequest = () => {
    if (pathname === "/workspace/requests") window.dispatchEvent(new Event(WORKSPACE_NEW_REQUEST_EVENT))
    else router.push("/workspace/requests?new=1")
  }

  const newRoom = () => {
    if (pathname === "/workspace") window.dispatchEvent(new Event(WORKSPACE_NEW_ROOM_EVENT))
    else router.push("/workspace?newRoom=1")
  }

  return (
    <div className="shrink-0 border-b border-line bg-black/10">
      <div className="flex h-12 items-center justify-between gap-3 px-4 sm:px-6">
        <span className="text-[13px] font-medium text-white/85">Workspace</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={openGuide}
            aria-label="How Workspace works"
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-white/50 hover:bg-white/[0.06] hover:text-white/80"
          >
            <CircleHelp className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">How it works</span>
          </button>
          {/* Owners open rooms themselves; editors ask an owner through a request. */}
          {canRequest && (
            <button
              type="button"
              onClick={newRequest}
              className={
                owns
                  ? "flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/85"
                  : "ml-1 flex items-center gap-1 whitespace-nowrap rounded-full bg-white px-3.5 py-1.5 text-[12px] font-medium text-black transition-transform duration-150 ease-out hover:bg-white/90 active:scale-[0.97]"
              }
            >
              {owns ? (
                <>
                  <span className="sm:hidden">Request</span>
                  <span className="hidden sm:inline">New request</span>
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" /> New request
                </>
              )}
            </button>
          )}
          {owns && (
            <button
              type="button"
              onClick={newRoom}
              className="ml-1 flex items-center gap-1 whitespace-nowrap rounded-full bg-white px-3.5 py-1.5 text-[12px] font-medium text-black transition-transform duration-150 ease-out hover:bg-white/90 active:scale-[0.97]"
            >
              <Plus className="h-3.5 w-3.5" /> New room
            </button>
          )}
        </div>
      </div>
      <nav aria-label="Workspace sections" className="-mb-px flex gap-1 overflow-x-auto px-4 pb-2.5 sm:px-6 [scrollbar-width:none]">
        {WORKSPACE_TABS.map((t) => {
          const active = pathname === t.href
          return (
            <Link
              key={t.href}
              href={t.href}
              data-tour={t.tour}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors ${
                active ? "bg-white/[0.1] text-white" : "text-white/55 hover:text-white/80"
              }`}
            >
              {t.label}
              {t.href === "/workspace/requests" && waiting > 0 && (
                <span className="rounded-full bg-amber-500/20 px-1.5 text-[10px] tabular-nums text-amber-200" title={`${waiting} waiting for your review`}>
                  {waiting}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
