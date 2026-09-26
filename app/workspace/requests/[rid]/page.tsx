"use client"

/**
 * Project request — edit (requester), review (team owner), read (both)
 * (ADR-019 P1). Edits autosave: each change is merged into one pending patch
 * and PATCHed after a short pause, so typing never waits on the network.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Plus, X } from "lucide-react"
import { AgentAvatar } from "@/components/office/AgentAvatar"
import { AGENT_ROSTER } from "@/lib/agentRoster"
import { LIMITS, type Priority, type ProjectRequest, type ReviewDecision } from "@/lib/projectRequests"
import { requestsApi, ApiError, type RequestCan, type RequestWithTeam } from "@/lib/requestsClient"
import DataTableEditor from "@/components/requests/DataTableEditor"
import FileAttachments from "@/components/requests/FileAttachments"
import { Button, Section, StatusPill, fieldClass, formatDate, inputClass } from "@/components/requests/requestUi"

type Editable = Pick<ProjectRequest, "title" | "goal" | "deadline" | "priority" | "fields" | "dataTable" | "members" | "agents">
type SaveState = "idle" | "saving" | "saved" | "error"

const SAVE_DELAY_MS = 700
const PRIORITIES: Priority[] = ["Low", "Med", "High"]
const PRIORITY_LABEL: Record<Priority, string> = { Low: "Low", Med: "Medium", High: "High" }

export default function ProjectRequestPage() {
  const { rid } = useParams<{ rid: string }>()
  const router = useRouter()
  const [req, setReq] = useState<RequestWithTeam | null>(null)
  const [can, setCan] = useState<RequestCan | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [save, setSave] = useState<SaveState>("idle")
  const [actionError, setActionError] = useState<string | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")
  const [approved, setApproved] = useState<{ roomId: string; notFound: string[]; seedError: boolean } | null>(null)
  const [memberDraft, setMemberDraft] = useState("")

  const patchRef = useRef<Partial<Editable>>({})
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const j = await requestsApi.get(rid)
      setReq(j.request)
      setCan(j.can)
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof ApiError && e.status === 404 ? "This request doesn't exist, or you don't have access to it." : (e as Error).message)
    }
  }, [rid])

  useEffect(() => {
    // Fetch on mount; load() only sets state after its await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const flush = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    const patch = patchRef.current
    if (Object.keys(patch).length === 0) return true
    patchRef.current = {}
    setSave("saving")
    try {
      await requestsApi.patch(rid, patch)
      setSave("saved")
      return true
    } catch (e) {
      patchRef.current = { ...patch, ...patchRef.current }
      setSave("error")
      setActionError((e as Error).message)
      return false
    }
  }, [rid])

  // Save what's pending if the user leaves mid-pause.
  useEffect(() => () => void flush(), [flush])

  const edit = <K extends keyof Editable>(key: K, value: Editable[K]) => {
    setReq((r) => (r ? { ...r, [key]: value } : r))
    patchRef.current = { ...patchRef.current, [key]: value }
    setProblems([])
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void flush(), SAVE_DELAY_MS)
  }

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setActionError(null)
    try {
      await fn()
    } catch (e) {
      if (e instanceof ApiError && e.problems.length > 0) setProblems(e.problems)
      else setActionError((e as Error).message)
    }
    setBusy(false)
  }

  const submit = () =>
    run(async () => {
      if (!(await flush())) return
      await requestsApi.submit(rid)
      await load()
    })

  const withdraw = () =>
    run(async () => {
      await flush()
      await requestsApi.withdraw(rid)
      await load()
    })

  const review = (decision: ReviewDecision) =>
    run(async () => {
      if (decision !== "approve" && !note.trim()) {
        setActionError("Add a note so the requester knows what to change.")
        return
      }
      const j = await requestsApi.review(rid, decision, note.trim())
      if (j.roomId) setApproved({ roomId: j.roomId, notFound: j.notFound ?? [], seedError: j.seedError === true })
      setNote("")
      await load()
    })

  if (loadError) {
    return (
      <Shell>
        <div className="mx-auto mt-16 max-w-[420px] text-center">
          <div className="text-[14px] text-white/75">{loadError}</div>
          <Link href="/workspace/requests" className="mt-4 inline-block text-[12px] text-white/40 hover:text-white/70">
            Back to requests
          </Link>
        </div>
      </Shell>
    )
  }
  if (!req || !can) {
    return (
      <Shell>
        <div className="mx-auto w-full max-w-[760px] animate-pulse space-y-4 px-8 py-10">
          <div className="h-7 w-2/3 rounded-lg bg-white/[0.05]" />
          <div className="h-24 rounded-xl bg-white/[0.03]" />
          <div className="h-40 rounded-xl bg-white/[0.03]" />
        </div>
      </Shell>
    )
  }

  const editable = can.edit
  const addMember = () => {
    const email = memberDraft.trim().toLowerCase()
    if (!email || req.members.some((m) => m.email === email) || req.members.length >= LIMITS.members) return
    edit("members", [...req.members, { email, role: "editor" }])
    setMemberDraft("")
  }

  return (
    <Shell
      right={
        editable ? (
          <span className="text-[11px] text-white/30" aria-live="polite">
            {save === "saving" ? "Saving…" : save === "saved" ? "Saved" : save === "error" ? "Not saved" : ""}
          </span>
        ) : null
      }
    >
      <div className="mx-auto w-full max-w-[760px] px-8 py-8">
        {/* Header */}
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-white/35">
          <span>{req.teamName}</span>
          <span className="text-white/15">·</span>
          <span>Requested by {req.requestedByName || "a team member"}</span>
          <StatusPill status={req.status} />
        </div>
        {editable ? (
          <input
            value={req.title}
            onChange={(e) => edit("title", e.target.value.slice(0, LIMITS.title))}
            aria-label="Request title"
            placeholder="Name this project"
            className="w-full bg-transparent text-[24px] font-medium tracking-tight text-white/90 outline-none placeholder:text-white/20"
          />
        ) : (
          <div className="text-[24px] font-medium tracking-tight text-white/90">{req.title}</div>
        )}

        {/* Review outcome */}
        {req.reviewNote && (req.status === "changes_requested" || req.status === "rejected" || req.status === "approved") && (
          <div
            className={`mt-5 rounded-xl px-4 py-3 text-[12px] leading-relaxed ${
              req.status === "changes_requested" ? "bg-amber-500/10 text-amber-100/90" : req.status === "rejected" ? "bg-red-500/10 text-red-100/85" : "bg-white/[0.04] text-white/70"
            }`}
          >
            <div className="mb-0.5 font-medium">
              {req.status === "changes_requested" ? "Changes requested" : req.status === "rejected" ? "Declined" : "Approved"}
              {req.reviewedAt ? ` · ${formatDate(req.reviewedAt)}` : ""}
            </div>
            <div className="whitespace-pre-wrap">{req.reviewNote}</div>
          </div>
        )}

        {req.status === "approved" && req.roomId && (
          <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-line bg-white/[0.03] px-4 py-3">
            <div className="min-w-0 text-[12px] text-white/60">
              <div className="text-white/80">The room is open</div>
              {approved?.notFound.length ? (
                <div className="mt-0.5 text-amber-300/80">No Aivory account for {approved.notFound.join(", ")}. Invite them to the team first.</div>
              ) : null}
              {approved?.seedError && <div className="mt-0.5 text-amber-300/80">The table couldn&apos;t be copied into the room. It&apos;s still here.</div>}
            </div>
            <Button tone="primary" onClick={() => router.push(`/workspace/${req.roomId}?view=discussion`)}>
              Open room
            </Button>
          </div>
        )}

        <div className="mt-8">
          <Section title="Goal" hint="What should this project achieve, and how will you know it's done?">
            {editable ? (
              <textarea
                value={req.goal}
                onChange={(e) => edit("goal", e.target.value.slice(0, LIMITS.goal))}
                rows={5}
                placeholder="Move our customer records from spreadsheets into Odoo before the end of November, so sales can quote from one place."
                className={`${inputClass} resize-y leading-relaxed`}
              />
            ) : (
              <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-white/75">{req.goal || "No goal written."}</div>
            )}
          </Section>

          <Section title="Timing and priority">
            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-[12px] text-white/45">
                <span>Deadline</span>
                {editable ? (
                  <input
                    type="date"
                    value={req.deadline ?? ""}
                    onChange={(e) => edit("deadline", e.target.value || null)}
                    className={`${fieldClass} py-1.5 [color-scheme:dark]`}
                  />
                ) : (
                  <span className="text-white/75">{req.deadline ? formatDate(req.deadline) : "None"}</span>
                )}
              </label>
              <div className="flex items-center gap-2 text-[12px] text-white/45">
                <span>Priority</span>
                <div className="flex items-center gap-0.5 rounded-full bg-white/[0.04] p-0.5" role="radiogroup" aria-label="Priority">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      role="radio"
                      aria-checked={req.priority === p}
                      disabled={!editable}
                      onClick={() => edit("priority", p)}
                      className={`rounded-full px-3 py-1 text-[12px] transition-colors duration-150 ${
                        req.priority === p ? "bg-white text-black" : "text-white/45 enabled:hover:text-white/75"
                      }`}
                    >
                      {PRIORITY_LABEL[p]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          <Section
            title="Details"
            hint="Anything the team needs up front: budget, client, systems involved."
            action={
              editable && req.fields.length < LIMITS.fields ? (
                <Button tone="ghost" onClick={() => edit("fields", [...req.fields, { label: "", value: "" }])}>
                  <span className="flex items-center gap-1">
                    <Plus className="h-3 w-3" /> Add detail
                  </span>
                </Button>
              ) : null
            }
          >
            {req.fields.length === 0 ? (
              <div className="text-[12px] text-white/30">{editable ? "No details yet." : "No details added."}</div>
            ) : (
              <div className="space-y-2">
                {req.fields.map((f, i) =>
                  editable ? (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={f.label}
                        onChange={(e) => edit("fields", req.fields.map((x, j) => (j === i ? { ...x, label: e.target.value.slice(0, LIMITS.fieldLabel) } : x)))}
                        placeholder="Budget"
                        aria-label={`Detail ${i + 1} name`}
                        className={`${fieldClass} w-[180px] shrink-0`}
                      />
                      <input
                        value={f.value}
                        onChange={(e) => edit("fields", req.fields.map((x, j) => (j === i ? { ...x, value: e.target.value.slice(0, LIMITS.fieldValue) } : x)))}
                        placeholder="IDR 50,000,000"
                        aria-label={`Detail ${i + 1} value`}
                        className={`${fieldClass} min-w-0 flex-1`}
                      />
                      <button
                        type="button"
                        onClick={() => edit("fields", req.fields.filter((_, j) => j !== i))}
                        aria-label={`Remove ${f.label || "detail"}`}
                        className="rounded-full p-1.5 text-white/25 hover:bg-white/[0.06] hover:text-white/70"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div key={i} className="flex gap-4 text-[13px]">
                      <span className="w-[180px] shrink-0 text-white/40">{f.label}</span>
                      <span className="text-white/75">{f.value}</span>
                    </div>
                  ),
                )}
              </div>
            )}
          </Section>

          <Section title="Data" hint="Each row becomes a task in the room. The first column is the task name.">
            <DataTableEditor value={req.dataTable} onChange={(t) => edit("dataTable", t)} readOnly={!editable} />
          </Section>

          <Section title="Files">
            <FileAttachments base={`/api/workspace/requests/${rid}/files`} canWrite={editable} />
          </Section>

          <Section title="People" hint="Your team gets access automatically. Add anyone else who should join the room.">
            {req.members.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {req.members.map((m) => (
                  <span key={m.email} className="flex items-center gap-2 rounded-full border border-line bg-white/[0.03] py-1 pl-3 pr-1 text-[12px] text-white/75">
                    <span>{m.email}</span>
                    {editable ? (
                      <>
                        <select
                          value={m.role}
                          onChange={(e) =>
                            edit("members", req.members.map((x) => (x.email === m.email ? { ...x, role: e.target.value as "editor" | "viewer" } : x)))
                          }
                          aria-label={`Access for ${m.email}`}
                          className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/60 outline-none"
                        >
                          <option value="editor">Can edit</option>
                          <option value="viewer">Can view</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => edit("members", req.members.filter((x) => x.email !== m.email))}
                          aria-label={`Remove ${m.email}`}
                          className="rounded-full p-1 text-white/30 hover:text-white/75"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </>
                    ) : (
                      <span className="pr-2 text-[11px] text-white/35">{m.role === "viewer" ? "Can view" : "Can edit"}</span>
                    )}
                  </span>
                ))}
              </div>
            )}
            {editable ? (
              <div className="flex gap-2">
                <input
                  type="email"
                  value={memberDraft}
                  onChange={(e) => setMemberDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addMember()
                    }
                  }}
                  placeholder="name@company.com"
                  aria-label="Add a person by email"
                  className={inputClass}
                />
                <Button onClick={addMember}>Add</Button>
              </div>
            ) : (
              req.members.length === 0 && <div className="text-[12px] text-white/30">Team members only.</div>
            )}
          </Section>

          <Section title="Agents" hint="Agents join the room and can read its brief, files and data.">
            <div className="flex flex-wrap gap-2">
              {AGENT_ROSTER.filter((a) => editable || req.agents.includes(a.type)).map((a) => {
                const on = req.agents.includes(a.type)
                return (
                  <button
                    key={a.type}
                    type="button"
                    disabled={!editable}
                    aria-pressed={on}
                    onClick={() =>
                      edit("agents", on ? req.agents.filter((x) => x !== a.type) : [...req.agents, a.type].slice(0, LIMITS.agents))
                    }
                    className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[12px] transition-[transform,background-color,border-color,color] duration-150 ease-out enabled:active:scale-[0.97] ${
                      on ? "border-white/25 bg-white/[0.08] text-white/85" : "border-line text-white/45 enabled:hover:text-white/70"
                    }`}
                  >
                    <AgentAvatar type={a.type} size={22} />
                    <span>{a.name}</span>
                    <span className="text-white/30">{a.title}</span>
                  </button>
                )
              })}
              {!editable && req.agents.length === 0 && <div className="text-[12px] text-white/30">No agents.</div>}
            </div>
          </Section>

          {/* Actions */}
          {(can.submit || can.withdraw || can.review) && (
            <div className="sticky bottom-0 -mx-8 mt-4 border-t border-line bg-surface-1/95 px-8 py-4 backdrop-blur">
              {problems.length > 0 && (
                <div className="mb-3 text-[12px] text-amber-300/85">Before you submit: {problems.join(", ").toLowerCase()}.</div>
              )}
              {actionError && <div className="mb-3 text-[12px] text-amber-300/85">{actionError}</div>}
              {can.review ? (
                <div className="flex flex-col gap-3">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, LIMITS.note))}
                    rows={2}
                    placeholder="Note for the requester (needed if you ask for changes or decline)"
                    aria-label="Review note"
                    className={`${inputClass} resize-none`}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button tone="danger" disabled={busy} onClick={() => review("reject")}>
                      Decline
                    </Button>
                    <Button disabled={busy} onClick={() => review("changes")}>
                      Ask for changes
                    </Button>
                    <Button tone="primary" disabled={busy} onClick={() => review("approve")}>
                      {busy ? "Opening room…" : "Approve and open room"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-end gap-2">
                  {can.withdraw && (
                    <Button tone="ghost" disabled={busy} onClick={withdraw}>
                      Withdraw
                    </Button>
                  )}
                  {can.submit && (
                    <Button tone="primary" disabled={busy} onClick={submit}>
                      {busy ? "Submitting…" : req.status === "changes_requested" ? "Resubmit for review" : "Submit for review"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Shell>
  )
}

function Shell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-black/10 px-6">
        <Link href="/workspace/requests" className="flex items-center gap-1.5 text-[13px] text-white/45 hover:text-white/75">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Requests</span>
        </Link>
        {right}
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
