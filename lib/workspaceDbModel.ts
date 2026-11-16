/**
 * Pure database-row model (Fase 3b) — CLIENT-SAFE, no server imports.
 *
 * Separated from lib/workspaceDb.ts (which pulls pg via lib/db) so client
 * components can share validation without dragging node builtins into the
 * browser bundle (Turbopack build failure otherwise).
 */

import { AGENT_ROSTER } from './agentRoster'

export type FieldType = "text" | "number" | "select" | "multi" | "checkbox" | "date" | "url" | "relation" | "rollup" | "person"
export type RollupOp = "count" | "donePct" | "sum"
export type FieldDef = {
  id: string
  name: string
  type: FieldType
  options: string[]
  /** relation: bare target doc id whose rows can be linked. */
  targetDocId?: string
  /** rollup: id of the relation field in THIS doc to aggregate over. */
  relationFieldId?: string
  /** rollup: aggregation to compute. */
  rollupOp?: RollupOp
  /** rollup sum: custom number field id in the TARGET doc to total. */
  rollupFieldId?: string
}
/** `person` cells hold PersonRef[] (people + agents, like assignees). */
export type CellValue = string | number | boolean | string[] | PersonRef[]

const VALID_FIELD_TYPES: ReadonlySet<string> = new Set(["text", "number", "select", "multi", "checkbox", "date", "url", "relation", "rollup", "person"])
const VALID_ROLLUP_OPS: ReadonlySet<string> = new Set(["count", "donePct", "sum"])
export const MAX_FIELDS_PER_DOC = 20
export const MAX_FIELD_OPTIONS = 20
export const MAX_CELL_TEXT = 500
export const MAX_LINKS_PER_CELL = 50

function cleanDocId(v: unknown): string {
  if (typeof v !== "string") return ""
  return v.trim().replace(/^workspace:(room:|db:)?/, "").slice(0, 64)
}

/** Validate raw props.dbFields into clean definitions (used by REST + PATCH). */
export function parseFieldDefs(raw: unknown): FieldDef[] {
  if (!Array.isArray(raw)) return []
  const out: FieldDef[] = []
  const seen = new Set<string>()
  for (const v of raw.slice(0, MAX_FIELDS_PER_DOC)) {
    if (!v || typeof v !== "object") continue
    const r = v as Record<string, unknown>
    const id = typeof r.id === "string" ? r.id.slice(0, 16) : ""
    if (!id || seen.has(id)) continue
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 24) : ""
    if (!name) continue
    let type: FieldType = typeof r.type === "string" && VALID_FIELD_TYPES.has(r.type) ? (r.type as FieldType) : "text"
    let options: string[] = []
    if ((type === "select" || type === "multi") && Array.isArray(r.options)) {
      for (const o of r.options.slice(0, MAX_FIELD_OPTIONS)) {
        if (typeof o !== "string") continue
        const t = o.trim().slice(0, 24)
        if (t && !options.includes(t)) options.push(t)
      }
    }
    // Relation needs a target doc; rollup needs a sibling relation + valid op.
    // Invalid configs degrade to text (column stays visible, no data loss).
    let targetDocId: string | undefined
    let relationFieldId: string | undefined
    let rollupOp: RollupOp | undefined
    let rollupFieldId: string | undefined
    if (type === "relation") {
      targetDocId = cleanDocId(r.targetDocId) || undefined
      if (!targetDocId) type = "text"
    }
    if (type === "rollup") {
      const rel = typeof r.relationFieldId === "string" ? r.relationFieldId.slice(0, 16) : ""
      const op = typeof r.rollupOp === "string" && VALID_ROLLUP_OPS.has(r.rollupOp) ? (r.rollupOp as RollupOp) : null
      const relOk = out.some((d) => d.id === rel && d.type === "relation")
      if (!rel || !relOk || !op) {
        type = "text"
      } else {
        relationFieldId = rel
        rollupOp = op
        if (op === "sum") {
          rollupFieldId = typeof r.rollupFieldId === "string" ? r.rollupFieldId.slice(0, 16) : undefined
        }
      }
    }
    seen.add(id)
    const def: FieldDef = { id, name, type, options }
    if (targetDocId) def.targetDocId = targetDocId
    if (relationFieldId) def.relationFieldId = relationFieldId
    if (rollupOp) def.rollupOp = rollupOp
    if (rollupFieldId) def.rollupFieldId = rollupFieldId
    out.push(def)
  }
  return out
}

function cleanCellValue(def: FieldDef, v: unknown): CellValue | undefined {
  switch (def.type) {
    case "text":
    case "url":
      return typeof v === "string" ? v.slice(0, MAX_CELL_TEXT) : undefined
    case "number": {
      const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN
      return Number.isFinite(n) ? n : undefined
    }
    case "date":
      return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined
    case "checkbox":
      return typeof v === "boolean" ? v : undefined
    case "select":
      return typeof v === "string" && def.options.includes(v) ? v : undefined
    case "multi": {
      const arr = Array.isArray(v) ? v : typeof v === "string" ? [v] : []
      const kept = arr.filter((x): x is string => typeof x === "string" && def.options.includes(x)).slice(0, MAX_FIELD_OPTIONS)
      return kept
    }
    case "relation": {
      // Linked row ids in the target doc. Validated as opaque ids here;
      // existence + readability resolve at read time (rollups, pickers).
      const arr = Array.isArray(v) ? v : typeof v === "string" ? [v] : []
      const kept = arr
        .filter((x): x is string => typeof x === "string" && x.trim() !== "")
        .map((x) => x.trim().slice(0, 64))
        .slice(0, MAX_LINKS_PER_CELL)
      return kept
    }
    case "rollup":
      // Computed server-side on read; client values are never stored.
      return undefined
    case "person":
      // Lenient on write: bad entries drop (REST rejects them first via personCellsProblem).
      return cleanPersonList(Array.isArray(v) ? v : v === undefined || v === null || v === "" ? [] : [v], MAX_PERSON_CELL)
  }
}

/** Validate a client-supplied cells object against defs; unknown fields dropped. */
export function cleanCells(cells: unknown, defs: FieldDef[]): Record<string, CellValue> {
  if (!cells || typeof cells !== "object" || Array.isArray(cells)) return {}
  const out: Record<string, CellValue> = {}
  const src = cells as Record<string, unknown>
  for (const def of defs) {
    if (!(def.id in src)) continue
    const c = cleanCellValue(def, src[def.id])
    if (c !== undefined) out[def.id] = c
  }
  return out
}

/** Read-time passthrough for stored cells (validation happens on write). */
export function readCells(v: unknown): Record<string, CellValue> {  if (!v || typeof v !== "object" || Array.isArray(v)) return {}
  const out: Record<string, CellValue> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string") out[k] = val.slice(0, MAX_CELL_TEXT)
    else if (typeof val === "number" && Number.isFinite(val)) out[k] = val
    else if (typeof val === "boolean") out[k] = val
    else if (Array.isArray(val)) {
      // Person cells are lists of refs; everything else is a list of strings.
      if (val.some((x) => x && typeof x === "object")) out[k] = cleanPersonList(val, MAX_PERSON_CELL)
      else out[k] = val.filter((x): x is string => typeof x === "string").slice(0, MAX_FIELD_OPTIONS)
    }
  }
  return out
}

/** Minimal row shape for rollup computation (server DbRow satisfies this). */
export type RollupSubject = {
  id: string
  status: string
  cells: Record<string, CellValue>
}

function linkedIds(cells: Record<string, CellValue>, fieldId: string): string[] {
  const v = cells[fieldId]
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string")
  return []
}

/**
 * Compute rollup values (pure): for every rollup def, aggregate over the
 * rows linked through its relation field. `getTargetRows` returns the
 * target doc's rows the caller is allowed to read, or null when unreadable
 * (those links resolve to null, never to leaked data).
 * Returns { rowId: { fieldId: value } }; null = nothing readable linked.
 */
export function computeRollups(
  rows: RollupSubject[],
  defs: FieldDef[],
  getTargetRows: (docId: string) => RollupSubject[] | null,
  /** Statuses of a target doc (its own config); default Todo/Doing/Done. */
  getTargetStatuses: (docId: string) => readonly StatusDef[] = () => DEFAULT_STATUSES,
): Record<string, Record<string, number | null>> {
  const out: Record<string, Record<string, number | null>> = {}
  const rollups = defs.filter((d) => d.type === "rollup" && d.relationFieldId && d.rollupOp)
  if (rollups.length === 0) return out
  const relTarget = new Map<string, string>()
  for (const d of defs) {
    if (d.type === "relation" && d.targetDocId) relTarget.set(d.id, d.targetDocId)
  }
  const cache = new Map<string, RollupSubject[] | null>()
  const targetOf = (docId: string): RollupSubject[] | null => {
    if (!cache.has(docId)) cache.set(docId, getTargetRows(docId))
    return cache.get(docId) ?? null
  }
  for (const row of rows) {
    const cell: Record<string, number | null> = {}
    let touched = false
    for (const def of rollups) {
      const relId = def.relationFieldId as string
      const targetDoc = relTarget.get(relId)
      if (!targetDoc) continue
      const links = linkedIds(row.cells, relId)
      if (links.length === 0) continue
      const readable = targetOf(targetDoc)
      if (!readable) {
        cell[def.id] = null
        touched = true
        continue
      }
      const byId = new Map(readable.map((r) => [r.id, r]))
      const linked = links.map((id) => byId.get(id)).filter((r): r is RollupSubject => !!r)
      if (linked.length === 0) continue
      if (def.rollupOp === "count") {
        cell[def.id] = linked.length
      } else if (def.rollupOp === "donePct") {
        // Canceled rows don't count either way (Linear-style progress).
        const statuses = getTargetStatuses(targetDoc)
        const live = linked.filter((r) => statusGroup(statuses, r.status) !== "canceled")
        const done = live.filter((r) => isDoneStatus(statuses, r.status)).length
        cell[def.id] = live.length === 0 ? 0 : Math.round((done / live.length) * 100)
      } else if (def.rollupOp === "sum" && def.rollupFieldId) {
        let total = 0
        for (const r of linked) {
          const v = r.cells[def.rollupFieldId as string]
          const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN
          if (Number.isFinite(n)) total += n
        }
        cell[def.id] = total
      }
      touched = true
    }
    if (touched) out[row.id] = cell
  }
  return out
}

/** Known Cerveau agents for @mention resolution (display name + type id).
 *  Derived from lib/agentRoster.ts — each agent matches on its first name,
 *  its type id, and the type id hyphenated. */
export const MENTIONABLE_AGENTS: ReadonlyArray<{ type: string; names: string[] }> = AGENT_ROSTER.map((a) => ({
  type: a.type,
  names: [...new Set([a.name.toLowerCase(), a.type, a.type.replace(/_/g, "-")])],
}))

export type ParsedMentions = { agents: string[]; emails: string[]; users: string[] }

/**
 * Picker-inserted mention token — the room chat's format (lib/spaceProtocol):
 * `[@Label](#member:<user id>)` / `[@Label](#agent:<type>)`. The label is
 * only for display; the ref after it is what gets notified.
 */
const MENTION_TOKEN_RE = /\[@([^[\]\n]{1,60})\]\(#(member|agent):([A-Za-z0-9_.@:-]{1,64})\)/g

/** Build the stored token for a picked person (label brackets stripped). */
export function mentionToken(p: PersonRef, label: string): string {
  const clean = label.replace(/[[\]\n]/g, "").trim().slice(0, 60) || "Member"
  return p.kind === "user" ? `[@${clean}](#member:${p.id})` : `[@${clean}](#agent:${p.type})`
}

/**
 * Parse @mentions from free text (pure): picker tokens `[@Name](#member:<id>)`
 * → user id / agent type; legacy @Geno/@autonomous → agent type;
 * @user@example.com → user email. Case-insensitive, deduped, capped.
 */
export function parseMentions(text: unknown): ParsedMentions {
  if (typeof text !== "string" || text.length === 0) return { agents: [], emails: [], users: [] }
  const agents = new Set<string>()
  const emails = new Set<string>()
  const users = new Set<string>()
  let m: RegExpExecArray | null
  const tokenRe = new RegExp(MENTION_TOKEN_RE.source, "g")
  while ((m = tokenRe.exec(text)) !== null) {
    if (m[2] === "member") {
      if (users.size < 20) users.add(m[3])
    } else if (KNOWN_AGENT_TYPES.has(m[3]) && agents.size < 20) {
      agents.add(m[3])
    }
  }
  const rest = text.replace(tokenRe, " ")
  const emailRe = /@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g
  while ((m = emailRe.exec(rest)) !== null) {
    if (emails.size < 20) emails.add(m[1].toLowerCase())
  }
  const stripped = rest.replace(emailRe, " ")
  const wordRe = /@([A-Za-z][A-Za-z0-9_-]*)/g
  while ((m = wordRe.exec(stripped)) !== null) {
    const tok = m[1].toLowerCase()
    const hit = MENTIONABLE_AGENTS.find((a) => a.names.includes(tok))
    if (hit && agents.size < 20) agents.add(hit.type)
  }
  return { agents: [...agents], emails: [...emails], users: [...users] }
}

/**
 * Turn a composer draft into stored text: each picked `@Label` (first
 * unclaimed occurrence, longest label first so "@Ann Lee" beats "@Ann")
 * becomes its token. Names typed by hand without the picker stay plain.
 */
export function tokenizeMentions(text: string, picked: Array<{ ref: PersonRef; label: string }>): { text: string; mentions: PersonRef[] } {
  let out = text
  const tokens: string[] = []
  const mentions: PersonRef[] = []
  const seen = new Set<string>()
  for (const c of [...picked].sort((a, b) => b.label.length - a.label.length)) {
    const needle = `@${c.label}`
    // Whole name only: "@Ann" must not match inside "@Anna".
    let at = out.indexOf(needle)
    while (at >= 0 && /[\p{L}\p{N}_]/u.test(out.charAt(at + needle.length))) at = out.indexOf(needle, at + 1)
    if (at < 0) continue
    // Placeholder first, so a shorter label can't match inside a token.
    out = out.slice(0, at) + `\u0000${tokens.length}\u0000` + out.slice(at + needle.length)
    tokens.push(mentionToken(c.ref, c.label))
    const k = personKey(c.ref)
    if (!seen.has(k)) {
      seen.add(k)
      mentions.push(c.ref)
    }
  }
  out = out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => tokens[Number(i)] ?? "")
  return { text: out, mentions }
}

/** Typed refs mentioned in text (picker tokens + legacy agent names; emails have no ref). */
export function mentionRefs(text: unknown): PersonRef[] {
  const { agents, users } = parseMentions(text)
  return [
    ...users.map((id): PersonRef => ({ kind: "user", id })),
    ...agents.map((type): PersonRef => ({ kind: "agent", type })),
  ]
}

export type MentionSegment = { kind: "text"; text: string } | { kind: "mention"; ref: PersonRef; label: string }

/** Split comment text into plain text and mention chips (picker tokens only). */
export function mentionSegments(text: string): MentionSegment[] {
  const out: MentionSegment[] = []
  const re = new RegExp(MENTION_TOKEN_RE.source, "g")
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const ref: PersonRef | null =
      m[2] === "member" ? { kind: "user", id: m[3] } : KNOWN_AGENT_TYPES.has(m[3]) ? { kind: "agent", type: m[3] } : null
    if (!ref) continue
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) })
    out.push({ kind: "mention", ref, label: m[1] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) })
  return out
}

/** Plain-text form of a comment (tokens → @Label), for excerpts and search. */
export function mentionPlainText(text: string): string {
  return text.replace(new RegExp(MENTION_TOKEN_RE.source, "g"), (_all, label: string) => `@${label}`)
}

export type DueFilter = "All" | "Overdue" | "Today" | "This week" | "Next 7 days" | "No date";
export const DUE_FILTERS: DueFilter[] = ["All", "Overdue", "Today", "This week", "Next 7 days", "No date"];

function isoDaysFrom(todayISO: string, delta: number): string {
  const d = new Date(`${todayISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function weekStartISO(todayISO: string): string {
  const d = new Date(`${todayISO}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** Relative due-date predicate (pure; todayISO = YYYY-MM-DD). */
export function matchesDueFilter(
  due: string,
  status: string,
  filter: string,
  todayISO: string,
  statuses: readonly StatusDef[] = DEFAULT_STATUSES,
): boolean {
  switch (filter) {
    case "Overdue":
      return !!due && due < todayISO && !isClosedStatus(statuses, status);
    case "Today":
      return due === todayISO;
    case "This week": {
      const start = weekStartISO(todayISO);
      const end = isoDaysFrom(start, 6);
      return !!due && due >= start && due <= end;
    }
    case "Next 7 days": {
      const end = isoDaysFrom(todayISO, 7);
      return !!due && due >= todayISO && due <= end;
    }
    case "No date":
      return !due;
    default:
      return true;
  }
}

export type AutomationRule = {
  id: string
  name: string
  whenStatus: string
  setAssignee?: string
  addComment?: string
  moveTo?: string
}

export const MAX_AUTOMATIONS = 20

/**
 * Validate raw props.dbAutomations (used by REST + PATCH). With `statuses`,
 * trigger/target must be one of the room's statuses; without (the room
 * PATCH, which never reads before writing) any status-shaped name passes and
 * the runner re-validates against the room's statuses.
 */
export function parseAutomationRules(raw: unknown, statuses?: readonly StatusDef[]): AutomationRule[] {
  const known = (s: string) => (statuses ? statuses.some((d) => d.name === s) : s.length > 0)
  if (!Array.isArray(raw)) return []
  const out: AutomationRule[] = []
  const seen = new Set<string>()
  for (const v of raw.slice(0, MAX_AUTOMATIONS)) {
    if (!v || typeof v !== "object") continue
    const r = v as Record<string, unknown>
    const id = typeof r.id === "string" ? r.id.slice(0, 32) : ""
    if (!id || seen.has(id)) continue
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 40) : ""
    if (!name) continue
    const whenStatus = cleanStatusName(r.whenStatus)
    if (!known(whenStatus)) continue
    const rule: AutomationRule = { id, name, whenStatus }
    if (typeof r.setAssignee === "string" && r.setAssignee.trim()) {
      rule.setAssignee = r.setAssignee.trim().slice(0, 100)
    }
    if (typeof r.addComment === "string" && r.addComment.trim()) {
      rule.addComment = r.addComment.trim().slice(0, 500)
    }
    const moveTo = cleanStatusName(r.moveTo)
    if (moveTo && known(moveTo) && moveTo !== whenStatus) {
      rule.moveTo = moveTo
    }
    if (rule.setAssignee === undefined && rule.addComment === undefined && rule.moveTo === undefined) continue
    seen.add(id)
    out.push(rule)
  }
  return out
}

/** Rules whose trigger matches a move into `next` (prev null = creation). */
export function matchRules(rules: AutomationRule[], prevStatus: string | null, nextStatus: string): AutomationRule[] {
  if (prevStatus === nextStatus) return []
  return rules.filter((r) => r.whenStatus === nextStatus)
}

// ---------------------------------------------------------------------------
// People on a task (P0 "assign to"): typed references instead of free text.
//
// A task has many `assignees` (who does it — people and/or agents), one
// human `owner` (who is accountable) and an immutable `createdBy`. The old
// single free-text `assignee` string stays on the row as a derived display
// mirror (search, room context, timeline keep reading it). When a row has no
// `assignees` key yet (written before this change), `rowAssignees` reads the
// legacy string: an agent type becomes an agent ref; anything else is
// resolved against the room's people on the client, or shown as unlinked.
// ---------------------------------------------------------------------------

export type PersonRef =
  | { kind: "user"; id: string; name?: string }
  | { kind: "agent"; type: string }

export const MAX_ASSIGNEES = 5
const MAX_PERSON_ID = 64
const MAX_PERSON_NAME = 60

const KNOWN_AGENT_TYPES: ReadonlySet<string> = new Set(AGENT_ROSTER.map((a) => a.type))

/** Stable string key for a person ref: `user:<id>` / `agent:<type>`. */
export function personKey(p: PersonRef): string {
  return p.kind === "user" ? `user:${p.id}` : `agent:${p.type}`
}

/** Validate one raw person ref (unknown agent types and empty ids drop). */
export function cleanPersonRef(v: unknown): PersonRef | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  if (r.kind === "agent") {
    const type = typeof r.type === "string" ? r.type.trim() : ""
    return KNOWN_AGENT_TYPES.has(type) ? { kind: "agent", type } : null
  }
  if (r.kind === "user") {
    const id = typeof r.id === "string" ? r.id.trim().slice(0, MAX_PERSON_ID) : ""
    if (!id) return null
    const name = typeof r.name === "string" ? r.name.trim().slice(0, MAX_PERSON_NAME) : ""
    return name ? { kind: "user", id, name } : { kind: "user", id }
  }
  return null
}

/** Deduped (by key) list of valid refs, capped at `max`. */
function cleanPersonList(v: unknown[], max: number): PersonRef[] {
  const out: PersonRef[] = []
  const seen = new Set<string>()
  for (const raw of v) {
    const p = cleanPersonRef(typeof raw === "string" ? personRefFromKey(raw) : raw)
    if (!p) continue
    const k = personKey(p)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(p)
    if (out.length >= max) break
  }
  return out
}

/** Validate a raw assignee list: deduped by key, capped at MAX_ASSIGNEES. */
export function cleanAssignees(v: unknown): PersonRef[] {
  if (!Array.isArray(v)) return []
  return cleanPersonList(v.filter((x) => typeof x !== "string"), MAX_ASSIGNEES)
}

/** Owner must be a person, never an agent (an agent is a delegate). */
export function cleanOwner(v: unknown): PersonRef | null {
  const p = cleanPersonRef(v)
  return p && p.kind === "user" ? p : null
}

/**
 * Assignees of a stored row. `raw` is the row's `assignees` value (undefined
 * for rows written before typed assignees); `legacy` is its `assignee` string.
 */
export function rowAssignees(raw: unknown, legacy: unknown): PersonRef[] {
  if (Array.isArray(raw)) return cleanAssignees(raw)
  const s = typeof legacy === "string" ? legacy.trim() : ""
  if (!s) return []
  const agent = MENTIONABLE_AGENTS.find((a) => a.type === s || a.names.includes(s.toLowerCase()))
  return agent ? [{ kind: "agent", type: agent.type }] : []
}

/**
 * The legacy free-text assignee a row still carries without a typed match —
 * shown as an "unlinked" chip until someone picks a real person.
 */
export function unlinkedAssignee(raw: unknown, legacy: unknown): string {
  if (Array.isArray(raw)) return ""
  const s = typeof legacy === "string" ? legacy.trim() : ""
  return s && rowAssignees(raw, legacy).length === 0 ? s.slice(0, 100) : ""
}

/** Display name for a ref (agents by roster first name). */
export function personLabel(p: PersonRef): string {
  if (p.kind === "agent") return AGENT_ROSTER.find((a) => a.type === p.type)?.name ?? p.type
  return p.name || "Member"
}

/** Derived `assignee` mirror string written next to `assignees`. */
export function assigneeMirror(list: PersonRef[]): string {
  return list.map(personLabel).join(", ").slice(0, 100)
}

/** Refs in `next` that weren't in `prev` (who to notify on assign). */
export function addedAssignees(prev: PersonRef[], next: PersonRef[]): PersonRef[] {
  const had = new Set(prev.map(personKey))
  return next.filter((p) => !had.has(personKey(p)))
}

/**
 * Person filter for the task views: "All" | "me" | "unassigned" | a person key.
 * "me" matches tasks where the viewer is an assignee OR the owner.
 */
export function matchesPeopleFilter(
  row: { assignees: PersonRef[]; owner: PersonRef | null; unlinked?: string },
  filter: string,
  selfKey: string | null,
): boolean {
  if (!filter || filter === "All") return true
  const keys = row.assignees.map(personKey)
  if (filter === "unassigned") return keys.length === 0 && !row.unlinked
  if (filter === "me") {
    if (!selfKey) return false
    return keys.includes(selfKey) || (row.owner ? personKey(row.owner) === selfKey : false)
  }
  return keys.includes(filter)
}

/** Saved-view people filter value check ("All" | "me" | "unassigned" | key). */
export function cleanPeopleFilter(v: unknown): string {
  if (typeof v !== "string") return "All"
  if (v === "All" || v === "me" || v === "unassigned") return v
  if (/^user:[^\s]{1,64}$/.test(v)) return v
  if (/^agent:[a-z0-9_-]{1,40}$/.test(v) && KNOWN_AGENT_TYPES.has(v.slice(6))) return v
  return "All"
}

/**
 * Typed assignees for an automation's `setAssignee` value: an agent type or
 * name → that agent; `user:<id>` → that person; "" → nobody. Anything else (old free-text rules) → null,
 * meaning "write the legacy string" so the rule keeps doing what it did.
 */
export function assigneesFromRuleValue(v: string): PersonRef[] | null {
  const s = v.trim()
  if (!s) return []
  if (s.startsWith("user:")) {
    const p = cleanPersonRef({ kind: "user", id: s.slice(5) })
    return p ? [p] : null
  }
  const agent = MENTIONABLE_AGENTS.find((a) => a.type === s || a.names.includes(s.toLowerCase()))
  return agent ? [{ kind: "agent", type: agent.type }] : null
}

// ---------------------------------------------------------------------------
// Followers (P1): who hears about a task. Auto-added when someone creates,
// owns, is assigned to, is @mentioned in, or comments on a task; anyone can
// unfollow from the drawer. Rows written before followers existed have no
// `followers` key — they read as creator + owner + assignees.
// ---------------------------------------------------------------------------

export const MAX_FOLLOWERS = 50

/** Validate a raw follower list: deduped by key, capped at MAX_FOLLOWERS. */
export function cleanFollowers(v: unknown): PersonRef[] {
  if (!Array.isArray(v)) return []
  const out: PersonRef[] = []
  const seen = new Set<string>()
  for (const raw of v) {
    const p = cleanPersonRef(raw)
    if (!p) continue
    const k = personKey(p)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(p)
    if (out.length >= MAX_FOLLOWERS) break
  }
  return out
}

/** `list` plus every ref in `add` it doesn't have yet (order kept, capped). */
export function addFollowers(list: PersonRef[], add: Array<PersonRef | null | undefined>): PersonRef[] {
  return cleanFollowers([...list, ...add.filter((p): p is PersonRef => !!p)])
}

/** `list` without `who`. */
export function removeFollower(list: PersonRef[], who: PersonRef): PersonRef[] {
  const k = personKey(who)
  return list.filter((p) => personKey(p) !== k)
}

/**
 * Followers of a stored row. `raw` is the row's `followers` value (undefined
 * for rows written before followers existed — those default to creator,
 * owner and assignees).
 */
export function rowFollowers(
  raw: unknown,
  row: { createdBy: PersonRef | null; owner: PersonRef | null; assignees: PersonRef[] },
): PersonRef[] {
  if (Array.isArray(raw)) return cleanFollowers(raw)
  return addFollowers([], [row.createdBy, row.owner, ...row.assignees])
}

/** Does `list` contain `key`? */
export function hasPerson(list: PersonRef[], key: string | null): boolean {
  return !!key && list.some((p) => personKey(p) === key)
}

export type RowChange =
  | { kind: "status"; from: string; to: string }
  | { kind: "due"; from: string; to: string }
  | { kind: "owner"; from: PersonRef | null; to: PersonRef | null }

/** Tracked field changes between two versions of a row (activity + follower notices). */
export function rowChanges(
  prev: { status: string; due: string; owner: PersonRef | null },
  next: { status: string; due: string; owner: PersonRef | null },
): RowChange[] {
  const out: RowChange[] = []
  if (prev.status !== next.status) out.push({ kind: "status", from: prev.status, to: next.status })
  if ((prev.due || "") !== (next.due || "")) out.push({ kind: "due", from: prev.due || "", to: next.due || "" })
  const pk = prev.owner ? personKey(prev.owner) : ""
  const nk = next.owner ? personKey(next.owner) : ""
  if (pk !== nk) out.push({ kind: "owner", from: prev.owner, to: next.owner })
  return out
}

/** A stored task comment. `authorRef`/`mentions` are absent on old comments. */
export type TaskComment = {
  id: string
  text: string
  author: string
  at: string
  authorRef?: PersonRef
  mentions?: PersonRef[]
}

/** Read one stored comment (bad shapes drop; typed fields validated). */
export function cleanComment(v: unknown): TaskComment | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  if (typeof r.id !== "string" || typeof r.text !== "string") return null
  const c: TaskComment = {
    id: r.id.slice(0, 40),
    text: r.text,
    author: typeof r.author === "string" ? r.author : "",
    at: typeof r.at === "string" ? r.at : "",
  }
  const a = cleanPersonRef(r.authorRef)
  if (a) c.authorRef = a
  if (Array.isArray(r.mentions)) {
    const ms = cleanFollowers(r.mentions).slice(0, 20)
    if (ms.length > 0) c.mentions = ms
  }
  return c
}

// ---------------------------------------------------------------------------
// Structure (P2): sub-tasks and dependencies, both inside one doc.
//
// `parentId` makes a row a sub-task of another row in the same doc. One
// level only: a parent is always a top-level row, and a row that has
// sub-tasks can't become a sub-task itself (so a cycle can't form).
// `blockedBy` lists same-doc row ids that must be Done first. A blocker that
// no longer exists is ignored. Rows written before P2 have neither key:
// no parent, no blockers.
// ---------------------------------------------------------------------------

export const MAX_BLOCKED_BY = 20
const MAX_ROW_ID = 64

/** Shape of a stored parent id (string or null; existence is checked on write). */
export function cleanParentId(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.trim().slice(0, MAX_ROW_ID)
  return s || null
}

/** Shape of a stored blocker list: ids deduped, never `selfId`, capped. */
export function cleanBlockedBy(v: unknown, selfId?: string): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const raw of v) {
    if (typeof raw !== "string") continue
    const id = raw.trim().slice(0, MAX_ROW_ID)
    if (!id || id === selfId || out.includes(id)) continue
    out.push(id)
    if (out.length >= MAX_BLOCKED_BY) break
  }
  return out
}

type TreeRow = { id: string; parentId: string | null }
type DepRow = { id: string; blockedBy: string[] }
type StatusRow = { id: string; status: string }

export type ParentProblem = "missing" | "self" | "cycle" | "nested" | "has_subtasks"

/** Ids of every row under `id` (children, grandchildren, …). */
export function descendantIds(rows: TreeRow[], id: string): string[] {
  const out: string[] = []
  const queue = [id]
  const seen = new Set<string>([id])
  while (queue.length > 0) {
    const cur = queue.shift() as string
    for (const r of rows) {
      if (r.parentId === cur && !seen.has(r.id)) {
        seen.add(r.id)
        out.push(r.id)
        queue.push(r.id)
      }
    }
  }
  return out
}

/**
 * Why `rowId` can't get `parentId` as its parent (null = fine; a null
 * parentId always is). `cycle` = the parent is one of the row's own
 * descendants; `nested` = the parent is itself a sub-task; `has_subtasks` =
 * the row has sub-tasks of its own (both keep it one level deep).
 */
export function parentProblem(rows: TreeRow[], rowId: string, parentId: string | null): ParentProblem | null {
  if (parentId === null) return null
  if (parentId === rowId) return "self"
  const parent = rows.find((r) => r.id === parentId)
  if (!parent) return "missing"
  if (descendantIds(rows, rowId).includes(parentId)) return "cycle"
  if (parent.parentId !== null && rows.some((r) => r.id === parent.parentId)) return "nested"
  if (rows.some((r) => r.parentId === rowId)) return "has_subtasks"
  return null
}

/** Would `rowId` blocked by `blockers` close a loop (a blocker already waits on `rowId`)? */
export function blockedByCycle(rows: DepRow[], rowId: string, blockers: string[]): boolean {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const seen = new Set<string>()
  const stack = [...blockers]
  while (stack.length > 0) {
    const cur = stack.pop() as string
    if (cur === rowId) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    // rowId's own current edges are being replaced, never followed.
    const r = byId.get(cur)
    if (r) stack.push(...r.blockedBy)
  }
  return false
}

export type BlockedByProblem = "self" | "missing" | "cycle" | "too_many"

/** Why `rowId` can't be blocked by `blockers` (null = fine). */
export function blockedByProblem(rows: DepRow[], rowId: string, blockers: string[]): BlockedByProblem | null {
  if (blockers.length > MAX_BLOCKED_BY) return "too_many"
  if (blockers.includes(rowId)) return "self"
  const ids = new Set(rows.map((r) => r.id))
  if (blockers.some((b) => !ids.has(b))) return "missing"
  if (blockedByCycle(rows, rowId, blockers)) return "cycle"
  return null
}

/** Sub-task progress of `parentId`: done / total (0/0 = no sub-tasks). */
export function subtaskProgress(
  rows: Array<TreeRow & StatusRow>,
  parentId: string,
  statuses: readonly StatusDef[] = DEFAULT_STATUSES,
): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const r of rows) {
    if (r.parentId !== parentId) continue
    const g = statusGroup(statuses, r.status)
    // Canceled sub-tasks drop out of the count (neither open nor done).
    if (g === "canceled") continue
    total++
    if (g === "done") done++
  }
  return { done, total }
}

/** Blockers of `row` that exist and are still open (not done / canceled). */
export function openBlockers<R extends DepRow & StatusRow>(
  rows: R[],
  row: DepRow,
  statuses: readonly StatusDef[] = DEFAULT_STATUSES,
): R[] {
  if (row.blockedBy.length === 0) return []
  const byId = new Map(rows.map((r) => [r.id, r]))
  const out: R[] = []
  for (const id of row.blockedBy) {
    const b = byId.get(id)
    if (b && !isClosedStatus(statuses, b.status)) out.push(b)
  }
  return out
}

/** Is `row` waiting on any blocker that is still open? */
export function isBlocked(
  rows: Array<DepRow & StatusRow>,
  row: DepRow,
  statuses: readonly StatusDef[] = DEFAULT_STATUSES,
): boolean {
  return openBlockers(rows, row, statuses).length > 0
}

/**
 * Tasks that `doneId` (now closed: done or canceled) was the last open
 * blocker of: they list it in `blockedBy`, are open themselves and wait on
 * nothing else.
 */
export function unblockedBy<R extends DepRow & StatusRow>(
  rows: R[],
  doneId: string,
  statuses: readonly StatusDef[] = DEFAULT_STATUSES,
): R[] {
  const done = rows.find((r) => r.id === doneId)
  if (!done || !isClosedStatus(statuses, done.status)) return []
  return rows.filter(
    (r) => !isClosedStatus(statuses, r.status) && r.blockedBy.includes(doneId) && !isBlocked(rows, r, statuses),
  )
}

/** Rows that list `id` as a blocker (the drawer's "Blocking" line). */
export function blocking<R extends DepRow>(rows: R[], id: string): R[] {
  return rows.filter((r) => r.blockedBy.includes(id))
}

// ---------------------------------------------------------------------------
// Custom statuses (P2): each room configures its own status names in
// props.dbStatuses, every one in a fixed group. Rows keep storing the status
// NAME; logic (overdue, progress, blockers, notices, My tasks) asks the
// group. Rooms without config get Todo / Doing / Done, so old rows behave
// exactly as before.
// ---------------------------------------------------------------------------

export type StatusGroup = "todo" | "in_progress" | "done" | "canceled"
export type StatusDef = { name: string; group: StatusGroup }

export const STATUS_GROUPS: readonly StatusGroup[] = ["todo", "in_progress", "done", "canceled"]
export const STATUS_GROUP_LABEL: Record<StatusGroup, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  canceled: "Canceled",
}
export const DEFAULT_STATUSES: readonly StatusDef[] = [
  { name: "Todo", group: "todo" },
  { name: "Doing", group: "in_progress" },
  { name: "Done", group: "done" },
]
export const MAX_STATUSES = 12
export const MAX_STATUS_NAME = 16

const GROUP_SET: ReadonlySet<string> = new Set(STATUS_GROUPS)
/** Names rows were written with before custom statuses (and what REST clients still send). */
const LEGACY_GROUP: Record<string, StatusGroup> = { Todo: "todo", Doing: "in_progress", Done: "done" }

export function cleanStatusName(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, MAX_STATUS_NAME) : ""
}

export type StatusDefsProblem = "shape" | "empty_name" | "duplicate" | "bad_group" | "too_many" | "no_todo" | "no_done"

/** Why `raw` isn't a valid status list (null = fine). Used by the room PATCH (400). */
export function statusDefsProblem(raw: unknown): StatusDefsProblem | null {
  if (!Array.isArray(raw)) return "shape"
  if (raw.length > MAX_STATUSES) return "too_many"
  const seen = new Set<string>()
  const groups = new Set<string>()
  for (const v of raw) {
    if (!v || typeof v !== "object") return "shape"
    const r = v as Record<string, unknown>
    const name = cleanStatusName(r.name)
    if (!name) return "empty_name"
    if (typeof r.group !== "string" || !GROUP_SET.has(r.group)) return "bad_group"
    const k = name.toLowerCase()
    if (seen.has(k)) return "duplicate"
    seen.add(k)
    groups.add(r.group)
  }
  if (!groups.has("todo")) return "no_todo"
  if (!groups.has("done")) return "no_done"
  return null
}

/**
 * The room's statuses from props.dbStatuses, ordered by group (to do → in
 * progress → done → canceled), keeping the configured order inside a group.
 * Missing or invalid config → the default three.
 */
export function parseStatusDefs(raw: unknown): StatusDef[] {
  if (statusDefsProblem(raw) !== null) return DEFAULT_STATUSES.map((s) => ({ ...s }))
  const defs = (raw as Array<Record<string, unknown>>).map((r) => ({ name: cleanStatusName(r.name), group: r.group as StatusGroup }))
  return sortStatusDefs(defs)
}

/** Stable sort by group order (the board's column order). */
export function sortStatusDefs(defs: StatusDef[]): StatusDef[] {
  return defs
    .map((d, i) => ({ d, i }))
    .sort((a, b) => STATUS_GROUPS.indexOf(a.d.group) - STATUS_GROUPS.indexOf(b.d.group) || a.i - b.i)
    .map((x) => x.d)
}

/**
 * Group of a status name. A name the room doesn't list (a row written before
 * a rename, or by an old client) falls back to the legacy meaning of
 * Todo/Doing/Done, else "todo" — so it stays open rather than silently closed.
 */
export function statusGroup(statuses: readonly StatusDef[], status: string): StatusGroup {
  const hit = statuses.find((s) => s.name === status)
  if (hit) return hit.group
  return LEGACY_GROUP[status] ?? "todo"
}

/** Done group only (follower "done" notice, progress, the sub-task checkbox). */
export function isDoneStatus(statuses: readonly StatusDef[], status: string): boolean {
  return statusGroup(statuses, status) === "done"
}

/** Done or canceled: no longer open (overdue, blockers, My tasks, reminders). */
export function isClosedStatus(statuses: readonly StatusDef[], status: string): boolean {
  const g = statusGroup(statuses, status)
  return g === "done" || g === "canceled"
}

/** First status of `group` in the room's order (null when the group is empty). */
export function firstStatusOf(statuses: readonly StatusDef[], group: StatusGroup): string | null {
  return statuses.find((s) => s.group === group)?.name ?? null
}

/** The status new tasks start in: first of the todo group. */
export function defaultStatus(statuses: readonly StatusDef[]): string {
  return firstStatusOf(statuses, "todo") ?? statuses[0]?.name ?? "Todo"
}

/**
 * Canonical room status for what a writer sent: exact name, then a
 * case-insensitive match, then the legacy names (Todo/Doing/Done → first
 * status of that group, so agents and old clients keep working after a
 * rename). null = not a status of this room.
 */
export function resolveStatus(statuses: readonly StatusDef[], input: unknown): string | null {
  const name = cleanStatusName(input)
  if (!name) return null
  if (statuses.some((s) => s.name === name)) return name
  const ci = statuses.find((s) => s.name.toLowerCase() === name.toLowerCase())
  if (ci) return ci.name
  const legacy = LEGACY_GROUP[name]
  return legacy ? firstStatusOf(statuses, legacy) : null
}

/** Entering the done group from outside it (follower notice, unblocked notice). */
export function entersDone(statuses: readonly StatusDef[], from: string, to: string): boolean {
  return isDoneStatus(statuses, to) && !isDoneStatus(statuses, from)
}

/** Entering a closed group (done or canceled) from an open one: frees blocked tasks. */
export function entersClosed(statuses: readonly StatusDef[], from: string, to: string): boolean {
  return isClosedStatus(statuses, to) && !isClosedStatus(statuses, from)
}

/** Entering the in-progress group (the "still blocked" warning). */
export function entersInProgress(statuses: readonly StatusDef[], from: string, to: string): boolean {
  return statusGroup(statuses, to) === "in_progress" && statusGroup(statuses, from) !== "in_progress"
}

/** What a rename / delete touches besides the rows themselves. */
export type StatusRefProps = {
  dbWip?: Record<string, number>
  dbAutomations?: AutomationRule[]
  dbViews?: Array<Record<string, unknown> & { statusFilter?: string }>
  dbTemplates?: Array<Record<string, unknown> & { status?: string }>
}

/**
 * Props patch for renaming status `from` → `to`: WIP limit keys, automation
 * triggers/targets, saved-view status filters and template statuses follow.
 * Only keys that changed are returned (the room PATCH merges shallowly).
 */
export function renameStatusRefs(props: StatusRefProps, from: string, to: string): StatusRefProps {
  const out: StatusRefProps = {}
  if (props.dbWip && from in props.dbWip) {
    const wip: Record<string, number> = {}
    for (const [k, v] of Object.entries(props.dbWip)) wip[k === from ? to : k] = v
    out.dbWip = wip
  }
  if (props.dbAutomations?.some((r) => r.whenStatus === from || r.moveTo === from)) {
    out.dbAutomations = props.dbAutomations.map((r) => ({
      ...r,
      whenStatus: r.whenStatus === from ? to : r.whenStatus,
      ...(r.moveTo === from ? { moveTo: to } : {}),
    }))
  }
  if (props.dbViews?.some((v) => v.statusFilter === from)) {
    out.dbViews = props.dbViews.map((v) => (v.statusFilter === from ? { ...v, statusFilter: to } : v))
  }
  if (props.dbTemplates?.some((t) => t.status === from)) {
    out.dbTemplates = props.dbTemplates.map((t) => (t.status === from ? { ...t, status: to } : t))
  }
  return out
}

/**
 * Props patch for deleting status `name` (its rows move to `moveTo`): its WIP
 * limit goes, rules triggered by it go, rules moving into it lose the move
 * (and go if nothing else is left), views filtering on it show all, templates
 * start in `moveTo`.
 */
export function deleteStatusRefs(props: StatusRefProps, name: string, moveTo: string): StatusRefProps {
  const out: StatusRefProps = {}
  if (props.dbWip && name in props.dbWip) {
    const wip = { ...props.dbWip }
    delete wip[name]
    out.dbWip = wip
  }
  if (props.dbAutomations?.some((r) => r.whenStatus === name || r.moveTo === name)) {
    out.dbAutomations = props.dbAutomations
      .filter((r) => r.whenStatus !== name)
      .map((r) => {
        if (r.moveTo !== name) return r
        const rest = { ...r }
        delete rest.moveTo
        return rest
      })
      .filter((r) => r.setAssignee !== undefined || r.addComment !== undefined || r.moveTo !== undefined)
  }
  if (props.dbViews?.some((v) => v.statusFilter === name)) {
    out.dbViews = props.dbViews.map((v) => (v.statusFilter === name ? { ...v, statusFilter: "All" } : v))
  }
  if (props.dbTemplates?.some((t) => t.status === name)) {
    out.dbTemplates = props.dbTemplates.map((t) => (t.status === name ? { ...t, status: moveTo } : t))
  }
  return out
}

// ---------------------------------------------------------------------------
// Person fields (P2): a custom field whose cell is a list of people/agents
// ("Reviewer", "QA"). Same refs and picker as assignees, max MAX_PERSON_CELL.
// Writes accept refs or `user:<id>` / `agent:<type>` keys; stored as refs (with
// the user's name as a fallback label, like assignees). Each person field has
// its own filter (All | me | unassigned | key), kept in saved views as
// `fieldFilters: { [fieldId]: filter }`.
// ---------------------------------------------------------------------------

export const MAX_PERSON_CELL = 5

/** `user:<id>` / `agent:<type>` → raw ref (validated by cleanPersonRef). */
export function personRefFromKey(key: string): PersonRef | null {
  const s = key.trim()
  if (s.startsWith("agent:")) return cleanPersonRef({ kind: "agent", type: s.slice(6) })
  if (s.startsWith("user:")) return cleanPersonRef({ kind: "user", id: s.slice(5) })
  return null
}

export type PersonCellProblem = { fieldId: string; reason: "shape" | "too_many" }

/**
 * Strict check of the person cells in a REST write: each must be null/[] (clear)
 * or a list of valid refs/keys, at most MAX_PERSON_CELL. Other field types keep
 * their lenient cleaning in cleanCells.
 */
export function personCellsProblem(cells: unknown, defs: FieldDef[]): PersonCellProblem | null {
  if (!cells || typeof cells !== "object" || Array.isArray(cells)) return null
  const src = cells as Record<string, unknown>
  for (const def of defs) {
    if (def.type !== "person" || !(def.id in src)) continue
    const v = src[def.id]
    if (v === null || v === undefined) continue
    if (!Array.isArray(v)) return { fieldId: def.id, reason: "shape" }
    if (v.length > MAX_PERSON_CELL) return { fieldId: def.id, reason: "too_many" }
    for (const raw of v) {
      const p = typeof raw === "string" ? personRefFromKey(raw) : cleanPersonRef(raw)
      if (!p) return { fieldId: def.id, reason: "shape" }
    }
  }
  return null
}

/** The people in a stored cell (non-person values read as nobody). */
export function cellPeople(v: CellValue | undefined): PersonRef[] {
  if (!Array.isArray(v)) return []
  return cleanPersonList(v.filter((x) => typeof x !== "string"), MAX_PERSON_CELL)
}

/** Person-field filter: "All" | "me" | "unassigned" (nobody set) | a person key. */
export function matchesPersonCellFilter(list: PersonRef[], filter: string, selfKey: string | null): boolean {
  if (!filter || filter === "All") return true
  if (filter === "unassigned") return list.length === 0
  const key = filter === "me" ? selfKey : filter
  if (!key) return false
  return list.some((p) => personKey(p) === key)
}

/** Saved-view per-field person filters: `{ fieldId: filter }`, "All" dropped. */
export function cleanFieldFilters(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {}
  const out: Record<string, string> = {}
  for (const [k, raw] of Object.entries(v as Record<string, unknown>).slice(0, MAX_FIELDS_PER_DOC)) {
    const id = k.slice(0, 16)
    const f = cleanPeopleFilter(raw)
    if (id && f !== "All") out[id] = f
  }
  return out
}

/** Plain text of a cell (room context for agents, exports): person → names. */
export function cellText(def: Pick<FieldDef, "type">, v: CellValue | undefined): string {
  if (v === undefined || v === "") return ""
  if (def.type === "person") return cellPeople(v).map(personLabel).join(", ")
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string").join(", ")
  return String(v)
}

// ---------------------------------------------------------------------------
// "Set you as Reviewer" notices (inbox source `field_assigned`). The inbox row
// has one text column, so the excerpt carries "<field name>\n<task title>".
// ---------------------------------------------------------------------------

export type FieldPeopleAdded = { fieldId: string; fieldName: string; added: PersonRef[] }

/**
 * People newly set on each person field between two cell maps (`prev` may be
 * empty for a new task). Order follows `defs`; fields with nobody new are left out.
 */
export function addedFieldPeople(
  prev: Record<string, CellValue> | undefined,
  next: Record<string, CellValue> | undefined,
  defs: readonly FieldDef[],
): FieldPeopleAdded[] {
  const out: FieldPeopleAdded[] = []
  for (const def of defs) {
    if (def.type !== "person") continue
    const added = addedAssignees(cellPeople(prev?.[def.id]), cellPeople(next?.[def.id]))
    if (added.length > 0) out.push({ fieldId: def.id, fieldName: def.name, added })
  }
  return out
}

/** Inbox excerpt of a `field_assigned` notice. */
export function fieldNoticeExcerpt(fieldName: string, title: string): string {
  const f = fieldName.replace(/\s+/g, " ").trim().slice(0, 60) || "a field"
  return `${f}\n${(title.trim() || "Untitled").replace(/\s+/g, " ").slice(0, 138)}`
}

/** Splits a `field_assigned` excerpt back into field name and task title (no field → null). */
export function parseFieldNotice(excerpt: string): { field: string; title: string } | null {
  const i = excerpt.indexOf("\n")
  if (i <= 0) return null
  return { field: excerpt.slice(0, i), title: excerpt.slice(i + 1) }
}

/**
 * How many of the secondary task filters (priority, due, people, one per
 * person field) are set — the badge on the toolbar's "Filters" button.
 * Status and search live outside the popover and aren't counted.
 */
export function activeFilterCount(f: { priority: string; due: string; people: string; fieldFilters: Record<string, string> }): number {
  const on = (v: string | undefined) => !!v && v !== "All"
  return [f.priority, f.due, f.people].filter(on).length + Object.values(f.fieldFilters).filter(on).length
}
