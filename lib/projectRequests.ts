/**
 * Project requests (ADR-019 P1) — pure model: validation, transitions, rows.
 * Client-safe (no pg/node imports) so the form can share the limits.
 */
import { isAgentType } from "@/lib/agentRoster"

export type RequestStatus = "draft" | "submitted" | "changes_requested" | "approved" | "rejected" | "withdrawn"
export type Priority = "Low" | "Med" | "High"
export type ReviewDecision = "approve" | "changes" | "reject"

export interface RequestField { label: string; value: string }
export interface DataTable { columns: string[]; rows: string[][] }
export interface RequestMember { email: string; role: "editor" | "viewer" }

export interface ProjectRequest {
  id: string
  workspaceId: string
  title: string
  goal: string
  deadline: string | null
  priority: Priority
  status: RequestStatus
  requestedBy: string
  requestedByName: string
  fields: RequestField[]
  dataTable: DataTable
  members: RequestMember[]
  agents: string[]
  reviewer: string | null
  reviewNote: string | null
  reviewedAt: string | null
  roomId: string | null
  submittedAt: string | null
  createdAt: string
  updatedAt: string
}

export const LIMITS = {
  title: 120,
  goal: 4000,
  fields: 20,
  fieldLabel: 60,
  fieldValue: 500,
  columns: 8,
  columnName: 60,
  rows: 200,
  cell: 500,
  members: 30,
  agents: 6,
  note: 1000,
} as const

const PRIORITIES = new Set<Priority>(["Low", "Med", "High"])
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Statuses in which the requester may edit the content. */
export const EDITABLE: ReadonlySet<RequestStatus> = new Set(["draft", "changes_requested"])
/** Statuses a requester may withdraw from. */
export const WITHDRAWABLE: ReadonlySet<RequestStatus> = new Set(["draft", "submitted", "changes_requested"])

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")

export type EditableInput = Partial<Pick<ProjectRequest, "title" | "goal" | "deadline" | "priority" | "fields" | "dataTable" | "members" | "agents">>

/**
 * Clean a create/patch body. Only keys present in the body are returned, so
 * a PATCH changes just what it sends. Returns an error for values that are
 * present but invalid (bad date, unknown agent, bad email, …).
 */
export function cleanRequestInput(input: unknown): { ok: true; value: EditableInput } | { ok: false; error: string } {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const out: EditableInput = {}

  if ("title" in o) {
    const t = str(o.title, LIMITS.title)
    if (!t) return { ok: false, error: "title required" }
    out.title = t
  }
  if ("goal" in o) out.goal = str(o.goal, LIMITS.goal)
  if ("deadline" in o) {
    if (o.deadline === null || o.deadline === "") out.deadline = null
    else {
      const d = str(o.deadline, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`)))
        return { ok: false, error: "deadline must be YYYY-MM-DD" }
      out.deadline = d
    }
  }
  if ("priority" in o) {
    if (!PRIORITIES.has(o.priority as Priority)) return { ok: false, error: "priority must be Low, Med or High" }
    out.priority = o.priority as Priority
  }
  if ("fields" in o) {
    if (!Array.isArray(o.fields)) return { ok: false, error: "fields must be a list" }
    if (o.fields.length > LIMITS.fields) return { ok: false, error: `at most ${LIMITS.fields} fields` }
    out.fields = o.fields
      .map((f) => {
        const r = (f && typeof f === "object" ? f : {}) as Record<string, unknown>
        return { label: str(r.label, LIMITS.fieldLabel), value: str(r.value, LIMITS.fieldValue) }
      })
      .filter((f) => f.label)
  }
  if ("dataTable" in o) {
    const t = cleanDataTable(o.dataTable)
    if (!t.ok) return t
    out.dataTable = t.value
  }
  if ("members" in o) {
    if (!Array.isArray(o.members)) return { ok: false, error: "members must be a list" }
    if (o.members.length > LIMITS.members) return { ok: false, error: `at most ${LIMITS.members} people` }
    const seen = new Set<string>()
    const members: RequestMember[] = []
    for (const m of o.members) {
      const r = (m && typeof m === "object" ? m : {}) as Record<string, unknown>
      const email = str(r.email, 254).toLowerCase()
      if (!EMAIL_RE.test(email)) return { ok: false, error: `not an email address: ${email || "(empty)"}` }
      if (seen.has(email)) continue
      seen.add(email)
      members.push({ email, role: r.role === "viewer" ? "viewer" : "editor" })
    }
    out.members = members
  }
  if ("agents" in o) {
    if (!Array.isArray(o.agents)) return { ok: false, error: "agents must be a list" }
    const agents = Array.from(new Set(o.agents.filter((a): a is string => typeof a === "string")))
    if (agents.length > LIMITS.agents) return { ok: false, error: `at most ${LIMITS.agents} agents` }
    const unknown = agents.find((a) => !isAgentType(a))
    if (unknown) return { ok: false, error: `unknown agent: ${unknown}` }
    out.agents = agents
  }
  return { ok: true, value: out }
}

export function cleanDataTable(v: unknown): { ok: true; value: DataTable } | { ok: false; error: string } {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>
  const cols = Array.isArray(o.columns) ? o.columns : []
  if (cols.length > LIMITS.columns) return { ok: false, error: `at most ${LIMITS.columns} columns` }
  const columns = cols.map((c) => str(c, LIMITS.columnName))
  if (columns.some((c) => !c)) return { ok: false, error: "every column needs a name" }
  const rawRows = Array.isArray(o.rows) ? o.rows : []
  if (rawRows.length > LIMITS.rows) return { ok: false, error: `at most ${LIMITS.rows} rows` }
  const rows = rawRows
    .map((r) => columns.map((_, i) => (Array.isArray(r) ? str(r[i], LIMITS.cell) : "")))
    .filter((r) => r.some((c) => c))
  return { ok: true, value: { columns, rows } }
}

/** What a submitted request must have. Empty array = ready. */
export function submitProblems(r: Pick<ProjectRequest, "title" | "goal">): string[] {
  const out: string[] = []
  if (!r.title.trim()) out.push("Add a title")
  if (!r.goal.trim()) out.push("Describe the goal")
  return out
}

/** Review transition, or null when the decision isn't allowed from this status. */
export function reviewTransition(status: RequestStatus, decision: ReviewDecision): RequestStatus | null {
  if (status !== "submitted") return null
  return decision === "approve" ? "approved" : decision === "changes" ? "changes_requested" : "rejected"
}

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString()
  return typeof v === "string" ? v : ""
}

function isoDate(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return typeof v === "string" && v ? v.slice(0, 10) : null
}

export function requestFromRow(row: Record<string, unknown>): ProjectRequest {
  const table = cleanDataTable(row.data_table)
  return {
    id: String(row.id ?? ""),
    workspaceId: String(row.workspace_id ?? ""),
    title: String(row.title ?? ""),
    goal: String(row.goal ?? ""),
    deadline: isoDate(row.deadline),
    priority: PRIORITIES.has(row.priority as Priority) ? (row.priority as Priority) : "Med",
    status: String(row.status ?? "draft") as RequestStatus,
    requestedBy: String(row.requested_by ?? ""),
    requestedByName: String(row.requested_by_name ?? ""),
    fields: Array.isArray(row.fields) ? (row.fields as RequestField[]) : [],
    dataTable: table.ok ? table.value : { columns: [], rows: [] },
    members: Array.isArray(row.members) ? (row.members as RequestMember[]) : [],
    agents: Array.isArray(row.agents) ? (row.agents as string[]) : [],
    reviewer: typeof row.reviewer === "string" ? row.reviewer : null,
    reviewNote: typeof row.review_note === "string" ? row.review_note : null,
    reviewedAt: row.reviewed_at ? iso(row.reviewed_at) : null,
    roomId: typeof row.room_id === "string" ? row.room_id : null,
    submittedAt: row.submitted_at ? iso(row.submitted_at) : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}
