"use client"

/**
 * Small picker opened by the "+" in the room panel: invite an agent, or add a
 * person by email. Agents go through POST /agents; people join the room's team
 * (seats enforced there) or, in a room without a team, get a grant on the room
 * (see lib/roomPeople). The caller reloads the room's members on `onAdded`.
 */
import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { AgentAvatar } from "@/components/office/AgentAvatar"
import { Button, inputClass } from "@/components/requests/requestUi"
import { ApiError, roomPeopleApi, teamsApi } from "@/lib/requestsClient"
import { addableAgents, addAgentError, addPersonError, alreadyInRoom, parseEmail, personTarget, type PersonRole } from "@/lib/roomPeople"

export type RoomAddKind = "agent" | "person"

export default function RoomAddDialog({
  kind,
  roomId,
  workspaceId,
  agentTypesInRoom,
  peopleInRoom,
  onClose,
  onAdded,
}: {
  kind: RoomAddKind
  roomId: string
  workspaceId: string | null
  agentTypesInRoom: string[]
  peopleInRoom: { email?: string }[]
  onClose: () => void
  onAdded: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<PersonRole>("editor")
  const inputRef = useRef<HTMLInputElement>(null)
  const target = personTarget(workspaceId)
  const options = addableAgents(agentTypesInRoom)

  useEffect(() => {
    if (kind === "person") inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [kind, busy, onClose])

  const addAgent = async (type: string) => {
    if (busy) return
    setBusy(type)
    setError(null)
    try {
      await roomPeopleApi.addAgent(roomId, type)
      onAdded()
      // Keep the picker open while agents remain, so several can be added in a row.
      if (options.length <= 1) onClose()
    } catch (e) {
      const err = e as ApiError
      setError(addAgentError(err.status, err.message))
    } finally {
      setBusy(null)
    }
  }

  const addPerson = async () => {
    if (busy) return
    const addr = parseEmail(email)
    if (!addr) {
      setError("Enter a valid email address.")
      inputRef.current?.focus()
      return
    }
    if (alreadyInRoom(addr, peopleInRoom)) {
      setError("They're already in this room.")
      return
    }
    setBusy("person")
    setError(null)
    try {
      if (target === "team" && workspaceId) await teamsApi.addMember(workspaceId, addr, role)
      else await roomPeopleApi.grantRoom(roomId, addr, role)
      onAdded()
      onClose()
    } catch (e) {
      const err = e as ApiError
      setError(addPersonError(err.status, err.message, target))
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="room-add-title">
      <div className="absolute inset-0" onClick={() => !busy && onClose()} aria-hidden />
      <div className="relative max-h-[90vh] w-full max-w-[420px] overflow-y-auto rounded-3xl border border-white/[0.08] bg-[#151517] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div id="room-add-title" className="text-[17px] font-semibold text-white">{kind === "agent" ? "Add an agent" : "Add a person"}</div>
            <div className="mt-1 text-[12.5px] leading-relaxed text-white/50">
              {kind === "agent"
                ? "Agents you add can be mentioned with @ in this room."
                : target === "team"
                  ? "They join the team and can open every room it has."
                  : "They get access to this room only."}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white/80">
            <X className="h-4 w-4" />
          </button>
        </div>

        {kind === "agent" ? (
          <div className="mt-5 space-y-1.5">
            {options.length === 0 ? (
              <div className="rounded-2xl border border-line px-4 py-6 text-center text-[12.5px] text-white/40">Every agent is already in this room.</div>
            ) : (
              options.map((a) => (
                <button
                  key={a.type}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void addAgent(a.type)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line px-3 py-2.5 text-left transition-[transform,background-color] duration-150 ease-out hover:bg-white/[0.05] active:scale-[0.99] disabled:opacity-50"
                >
                  <AgentAvatar type={a.type} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-white/85">{a.name}</span>
                    <span className="block truncate text-[11.5px] text-white/40">{a.title}</span>
                  </span>
                  <span className="text-[11.5px] text-white/45">{busy === a.type ? "Adding…" : "Add"}</span>
                </button>
              ))
            )}
          </div>
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void addPerson()
            }}
            className="mt-5 space-y-3"
          >
            <label className="block">
              <span className="mb-1.5 block text-[12px] text-white/60">Email</span>
              <input
                ref={inputRef}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError(null)
                }}
                placeholder="name@company.com"
                autoComplete="off"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] text-white/60">Access</span>
              <select value={role} onChange={(e) => setRole(e.target.value as PersonRole)} className={inputClass}>
                <option value="editor">Member: can chat and edit</option>
                <option value="viewer">Viewer: read only</option>
              </select>
            </label>
            <div className="flex justify-end pt-1">
              <Button type="submit" disabled={busy !== null}>{busy ? "Adding…" : "Add"}</Button>
            </div>
          </form>
        )}

        {error && (
          <div role="alert" className="mt-3 text-[12.5px] text-[#FF8A80]">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
