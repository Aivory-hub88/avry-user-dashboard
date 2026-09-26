"use client"

/**
 * Room (ADR-019 P2) — a project's shared conversation between the team and
 * its agents, built from the Console's own pieces (ChatMessage, ChatInput,
 * mention menu) so a room feels like the Console with more people in it.
 *
 * - One flat feed, oldest → newest (GET .../timeline). Replies show the
 *   message they answer as a quote instead of opening a thread panel.
 * - Your messages sit on the right, everyone else on the left with a name;
 *   agents keep the Console's avatar bubble.
 * - @mention an agent to give it work. Replying to an agent's message
 *   counts as mentioning it, so you can answer its questions without "@".
 * - Running agents show the Console's thinking row; a turn parked on an
 *   approval shows an inline card; a failed turn offers Retry.
 * - Sends are optimistic; the feed polls every 5 s, every 2 s while an agent
 *   is working.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { PanelRight } from "lucide-react"
import ChatMessage from "@/components/ChatMessage"
import ChatInput from "@/components/ChatInput"
import { NotificationCard } from "@/components/office/NotificationCard"
import RoomPanel, { type Autonomy, type RoomBrief, type RoomPerson } from "@/components/room/RoomPanel"
import { useDiscussionResource } from "@/hooks/useDiscussionResource"
import { useSelfId } from "@/hooks/useSelfId"
import { useWorkspaceAwareness } from "@/hooks/useWorkspaceAwareness"
import { collabAuthHeaders } from "@/lib/collabClient"
import { AGENT_ROSTER } from "@/lib/agentRoster"
import { agentDisplayName, type SpaceAgentTask } from "@/lib/spaceAgent"
import { resolveApproval, describeTool } from "@/lib/agentApprovals"
import { uploadFile, uploadProblem } from "@/lib/requestsClient"
import {
  displayBody,
  mentionedAgents,
  openTaskRows,
  personName,
  quoteText,
  tokenizeMentions,
  type RoomAgent,
  type TimelineMessage,
} from "@/lib/roomChat"
import type { MentionCandidate } from "@/lib/agentMentions"

interface MembersPayload {
  owner: { id: string; email: string | null; name: string | null } | null
  users: { id: string; email: string | null; name: string | null; role: string }[]
  team?: { id: string; email: string | null; name: string | null; role: string }[]
  agents: { type: string; role: string }[]
}

type Pending = { tempId: string; body: string; replyTo: TimelineMessage["replyTo"]; status: "sending" | "failed" }
type ReplyTarget = { message: TimelineMessage; name: string; isAgent: boolean }

const ROLE_LABEL: Record<string, string> = { owner: "Admin", editor: "Member", viewer: "Viewer" }

export default function RoomView({
  roomId,
  title,
  workspaceId,
  brief,
  requestId,
  canWrite,
  isOwner = false,
  autonomy: initialAutonomy = "suggest",
}: {
  roomId: string
  title: string
  workspaceId: string | null
  brief: RoomBrief | null
  requestId: string | null
  canWrite: boolean
  /** Only the owner may change how freely agents act on their own. */
  isOwner?: boolean
  autonomy?: Autonomy
}) {
  const selfId = useSelfId()
  const peers = useWorkspaceAwareness(workspaceId)
  const timeline = useDiscussionResource<{ messages: TimelineMessage[]; tasks: SpaceAgentTask[] }>(`/api/workspace/${roomId}/timeline`)
  const [members, setMembers] = useState<MembersPayload | null>(null)
  const [pending, setPending] = useState<Pending[]>([])
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null)
  const [busyTask, setBusyTask] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [filesReloadKey, setFilesReloadKey] = useState(0)
  const [panelOpen, setPanelOpen] = useState(true)
  const [autonomy, setAutonomy] = useState<Autonomy>(initialAutonomy)

  const changeAutonomy = async (next: Autonomy) => {
    const prev = autonomy
    setAutonomy(next)
    try {
      const r = await fetch(`/api/workspace/${roomId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
        body: JSON.stringify({ props: { autonomy: next } }),
      })
      if (!r.ok) throw new Error(String(r.status))
    } catch {
      setAutonomy(prev)
      setNotice("That setting couldn't be saved. Try again.")
    }
  }
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const stickToBottom = useRef(true)

  const messages = useMemo(() => timeline.data?.messages ?? [], [timeline.data])
  const tasks = useMemo(() => timeline.data?.tasks ?? [], [timeline.data])
  const taskRows = useMemo(() => openTaskRows(tasks, messages), [tasks, messages])
  const working = taskRows.some((r) => r.kind === "thinking")

  // Faster refresh while an agent is mid-turn, so its reply lands promptly.
  useEffect(() => {
    if (!working) return
    const t = window.setInterval(() => void timeline.refresh(), 2000)
    return () => window.clearInterval(t)
  }, [working, timeline])

  useEffect(() => {
    let alive = true
    fetch(`/api/workspace/${roomId}/members`, { headers: collabAuthHeaders(), cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j) setMembers(j as MembersPayload)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [roomId])

  const agents: RoomAgent[] = useMemo(() => {
    const types = new Set((members?.agents ?? []).map((a) => a.type))
    // An agent that already spoke here stays mentionable even if its grant was removed.
    for (const m of messages) if (m.author.actingMode === "agent" && m.author.agentType) types.add(m.author.agentType)
    return AGENT_ROSTER.filter((a) => types.has(a.type)).map((a) => ({ type: a.type, name: a.name }))
  }, [members, messages])

  const candidates: MentionCandidate[] = useMemo(
    () => agents.map((a) => ({ type: a.type, name: a.name, title: AGENT_ROSTER.find((r) => r.type === a.type)?.title ?? "", channels: [] })),
    [agents],
  )

  const nameById = useMemo(() => {
    const map = new Map<string, string>()
    const add = (p: { id: string; email: string | null; name: string | null }) => map.set(p.id, personName(p.email ?? "", p.name))
    if (members?.owner) add(members.owner)
    for (const p of members?.team ?? []) add(p)
    for (const p of members?.users ?? []) add(p)
    return map
  }, [members])

  const people: RoomPerson[] = useMemo(() => {
    const out = new Map<string, RoomPerson>()
    if (members?.owner) out.set(members.owner.id, { id: members.owner.id, name: nameById.get(members.owner.id) ?? "Owner", role: "Owner" })
    for (const p of [...(members?.team ?? []), ...(members?.users ?? [])])
      if (!out.has(p.id)) out.set(p.id, { id: p.id, name: nameById.get(p.id) ?? "Member", role: ROLE_LABEL[p.role] ?? p.role })
    return [...out.values()]
  }, [members, nameById])

  const whoIs = useCallback(
    (m: Pick<TimelineMessage, "author" | "authorName">): string =>
      m.author.actingMode === "agent"
        ? m.author.agentName || agentDisplayName(m.author.agentType ?? "")
        : personName(m.authorName, nameById.get(m.author.memberId)),
    [nameById],
  )

  // Drop optimistic rows once the real message is in the feed.
  useEffect(() => {
    if (pending.length === 0) return
    const bodies = new Set(messages.filter((m) => m.author.memberId === selfId).map((m) => m.body))
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPending((p) => p.filter((x) => x.status === "failed" || !bodies.has(x.body)))
  }, [messages, selfId, pending.length])

  // Keep the view pinned to the newest message unless the reader scrolled up.
  useEffect(() => {
    if (stickToBottom.current) endRef.current?.scrollIntoView({ block: "end" })
  }, [messages.length, pending.length, taskRows.length])

  const onScroll = () => {
    const el = scrollRef.current
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }

  const post = useCallback(
    async (p: Pending) => {
      try {
        const r = await fetch(`/api/workspace/${roomId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
          body: JSON.stringify({ body: p.body, ...(p.replyTo ? { replyTo: p.replyTo.id } : {}) }),
        })
        if (!r.ok) throw new Error(String(r.status))
        await timeline.refresh()
      } catch {
        setPending((cur) => cur.map((x) => (x.tempId === p.tempId ? { ...x, status: "failed" } : x)))
      }
    },
    [roomId, timeline],
  )

  const send = (text: string) => {
    const raw = text.trim()
    if (!raw || !canWrite) return
    let body = tokenizeMentions(raw, agents)
    // Replying to an agent is talking to it: mention it if nobody else was.
    if (replyTo?.isAgent && replyTo.message.author.agentType && mentionedAgents(body).length === 0) {
      const a = agents.find((x) => x.type === replyTo.message.author.agentType)
      if (a) body = `[@${a.name}](#agent:${a.type}) ${body}`
    }
    const p: Pending = {
      tempId: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      body,
      status: "sending",
      replyTo: replyTo
        ? { id: replyTo.message.id, kind: replyTo.isAgent ? "agent" : "user", authorId: replyTo.message.author.memberId, name: replyTo.name, agentType: replyTo.message.author.agentType ?? null, body: replyTo.message.body }
        : null,
    }
    stickToBottom.current = true
    setPending((cur) => [...cur, p])
    setReplyTo(null)
    void post(p)
  }

  const retrySend = (p: Pending) => {
    setPending((cur) => cur.map((x) => (x.tempId === p.tempId ? { ...x, status: "sending" } : x)))
    void post({ ...p, status: "sending" })
  }

  const runTask = async (task: SpaceAgentTask, after: { id: string; decision: "approve" | "deny" } | null) => {
    await fetch(`/api/workspace/${roomId}/agent-tasks/${task.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
      body: JSON.stringify(after ? { afterApprovalId: after.id, decision: after.decision } : {}),
    })
  }

  const decide = async (task: SpaceAgentTask, decision: "approve" | "deny") => {
    const approvalId = typeof task.approvalRef.id === "string" ? task.approvalRef.id : null
    if (!approvalId || busyTask) return
    setBusyTask(task.id)
    setNotice(null)
    try {
      await resolveApproval({ id: approvalId, _agent_type: task.agentType }, decision)
      if (decision === "approve") await runTask(task, { id: approvalId, decision })
      else
        await fetch(`/api/workspace/${roomId}/agent-tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
          body: JSON.stringify({ op: "cancel" }),
        })
    } catch {
      setNotice("That approval couldn't be recorded. It may have been decided somewhere else.")
    }
    setBusyTask(null)
    await timeline.refresh()
  }

  const retryTask = async (task: SpaceAgentTask) => {
    if (busyTask) return
    setBusyTask(task.id)
    try {
      await runTask(task, null)
    } catch {
      // the row stays "failed" and can be retried again
    }
    setBusyTask(null)
    await timeline.refresh()
  }

  const uploadFromComposer = async (list: FileList | null) => {
    if (!list || !canWrite) return
    for (const f of Array.from(list)) {
      const problem = uploadProblem(f)
      if (problem) {
        setNotice(problem)
        continue
      }
      setNotice(`Uploading ${f.name}…`)
      try {
        await uploadFile(`/api/workspace/${roomId}/files`, f)
        setFilesReloadKey((k) => k + 1)
        setNotice(null)
        // The server posts "<you> added <file>" to the room (and the lead agent may summarise it).
        void timeline.refresh()
      } catch (e) {
        setNotice((e as Error).message)
      }
    }
  }

  const replyPreviewOf = (r: TimelineMessage["replyTo"]) =>
    r
      ? {
          role: (r.kind === "agent" ? "assistant" : "user") as "user" | "assistant",
          content: quoteText(r.body),
          name: r.kind === "agent" ? agentDisplayName(r.agentType ?? "") : r.kind === "system" ? "Aivory" : r.authorId === selfId ? "You" : personName(r.name, r.authorId ? nameById.get(r.authorId) : null),
        }
      : undefined

  const loading = timeline.loading && messages.length === 0
  const empty = !loading && messages.length === 0 && pending.length === 0 && taskRows.length === 0

  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line bg-black/10 px-6">
        <div className="flex min-w-0 items-center gap-2 text-[13px]">
          <Link href="/workspace?view=pages" className="shrink-0 text-white/40 hover:text-white/70">
            Workspace
          </Link>
          <span className="shrink-0 text-white/20">/</span>
          <span className="truncate font-medium text-white/85">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {peers.length > 0 && (
            <span className="mr-1 flex items-center" title={`${peers.length} online`}>
              {peers.slice(0, 4).map((p, i) => (
                <span
                  key={`${p.name}-${i}`}
                  title={p.name}
                  className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#18181b] text-[10px] font-medium text-white/80"
                  style={{ backgroundColor: p.color || "rgba(255,255,255,.08)", marginLeft: i === 0 ? 0 : -6 }}
                >
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
              ))}
            </span>
          )}
          <Link href="/workspace/requests" className="rounded-full px-3 py-1.5 text-[12px] text-white/50 hover:bg-white/[0.06] hover:text-white/80">
            Requests
          </Link>
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            aria-label={panelOpen ? "Hide room details" : "Show room details"}
            aria-expanded={panelOpen}
            className={`rounded-full p-2 hover:bg-white/[0.06] ${panelOpen ? "text-white/75" : "text-white/40"}`}
          >
            <PanelRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-8 py-8">
            <div className="mx-auto flex max-w-[800px] flex-col">
              {loading && (
                <div className="space-y-6" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/[0.03]" />
                  ))}
                </div>
              )}
              {timeline.error && messages.length === 0 && (
                <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">This room&apos;s conversation couldn&apos;t load. It&apos;ll retry automatically.</div>
              )}
              {empty && (
                <div className="mx-auto mt-16 max-w-[460px] text-center">
                  <div className="text-[17px] font-medium text-white/85">{title}</div>
                  <div className="mt-2 text-[13px] leading-relaxed text-white/45">
                    {agents.length > 0
                      ? `Talk to the team here. Mention ${agents.map((a) => `@${a.name}`).join(" or ")} to hand an agent work, or reply to an agent to answer it.`
                      : "Talk to the team here. Invite an agent to the room to hand it work."}
                  </div>
                </div>
              )}

              {messages.map((m) => {
                if (m.deletedAt) return null
                if (m.author.actingMode === "system")
                  return (
                    <div key={m.id} className="mb-8 flex justify-center">
                      <span className="rounded-full bg-white/[0.04] px-3 py-1 text-[12px] text-white/45">{displayBody(m.body)}</span>
                    </div>
                  )
                const isAgent = m.author.actingMode === "agent"
                const name = whoIs(m)
                return (
                  <ChatMessage
                    key={m.id}
                    role={isAgent ? "assistant" : "user"}
                    content={displayBody(m.body)}
                    agentName={name}
                    agentType={isAgent ? m.author.agentType ?? null : null}
                    showAgentName
                    author={isAgent ? undefined : { name, self: m.author.memberId === selfId }}
                    replyPreview={replyPreviewOf(m.replyTo)}
                    onReply={canWrite ? () => setReplyTo({ message: m, name, isAgent }) : undefined}
                  />
                )
              })}

              {pending.map((p) => (
                <div key={p.tempId} className={p.status === "sending" ? "opacity-60" : ""}>
                  <ChatMessage role="user" content={displayBody(p.body)} author={{ name: "You", self: true }} replyPreview={replyPreviewOf(p.replyTo)} />
                  {p.status === "failed" && (
                    <div className="-mt-6 mb-6 flex justify-end gap-2 text-[12px]">
                      <span className="text-amber-300/85">Not sent.</span>
                      <button type="button" onClick={() => retrySend(p)} className="text-white/60 underline-offset-2 hover:text-white hover:underline">
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {taskRows.map((row) => {
                const name = agentDisplayName(row.task.agentType)
                if (row.kind === "thinking")
                  return <ChatMessage key={row.task.id} role="assistant" content="" isStreaming agentName={name} agentType={row.task.agentType} showAgentName />
                if (row.kind === "approval") {
                  const tool = typeof row.task.approvalRef.tool_name === "string" ? row.task.approvalRef.tool_name : "a tool"
                  return (
                    <div key={row.task.id} className="mb-8 ml-[52px] max-w-[560px]">
                      <NotificationCard
                        tone="warn"
                        badge="Needs approval"
                        icon={<span aria-hidden="true">⚠</span>}
                        title={describeTool(tool)}
                        subtitle={`${name} is waiting for your go-ahead before running this.`}
                        actions={
                          canWrite ? (
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                disabled={busyTask === row.task.id}
                                onClick={() => decide(row.task, "approve")}
                                className="rounded-full bg-[#b7cba6] px-3 py-1 text-[12px] font-medium text-black transition-transform duration-150 ease-out active:scale-[0.97] disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={busyTask === row.task.id}
                                onClick={() => decide(row.task, "deny")}
                                className="rounded-full bg-white/[0.06] px-3 py-1 text-[12px] text-white/70 transition-transform duration-150 ease-out hover:bg-white/[0.1] active:scale-[0.97] disabled:opacity-50"
                              >
                                Deny
                              </button>
                            </div>
                          ) : undefined
                        }
                      />
                    </div>
                  )
                }
                return (
                  <div key={row.task.id} className="mb-8 ml-[52px] flex items-center gap-3 text-[12px]">
                    <span className="text-amber-300/85">{name} couldn&apos;t finish that.</span>
                    {canWrite && (
                      <button
                        type="button"
                        disabled={busyTask === row.task.id}
                        onClick={() => retryTask(row.task)}
                        className="text-white/60 underline-offset-2 hover:text-white hover:underline disabled:opacity-50"
                      >
                        Try again
                      </button>
                    )}
                  </div>
                )
              })}
              <div ref={endRef} />
            </div>
          </div>

          <div className="shrink-0 px-8 pb-4 pt-2">
            <div className="mx-auto max-w-[800px]">
              {notice && <div className="mb-2 text-[12px] text-white/50" aria-live="polite">{notice}</div>}
              {canWrite ? (
                <ChatInput
                  onSend={(text) => send(text)}
                  enableMentions
                  mentionCandidates={candidates}
                  placeholder={agents.length > 0 ? `Message the room, @${agents[0].name} to bring in an agent` : "Message the room"}
                  replyTo={replyTo ? { role: replyTo.isAgent ? "assistant" : "user", content: quoteText(replyTo.message.body), name: replyTo.name } : null}
                  onCancelReply={() => setReplyTo(null)}
                  onAttachClick={() => fileInputRef.current?.click()}
                  showContextToolbar={false}
                />
              ) : (
                <div className="rounded-[20px] border border-line px-5 py-4 text-center text-[13px] text-white/40">You can read this room but not post in it.</div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  void uploadFromComposer(e.target.files)
                  e.target.value = ""
                }}
              />
            </div>
          </div>
        </div>

        {panelOpen && (
          <RoomPanel
            roomId={roomId}
            brief={brief}
            requestId={requestId}
            people={people}
            agents={agents}
            tasks={tasks}
            canWrite={canWrite}
            filesReloadKey={filesReloadKey}
            autonomy={autonomy}
            onAutonomyChange={isOwner ? changeAutonomy : undefined}
          />
        )}
      </div>
    </div>
  )
}
