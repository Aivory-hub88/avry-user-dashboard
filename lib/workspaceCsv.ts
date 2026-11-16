/**
 * CSV import/export for the Tasks table — pure, CLIENT-SAFE (no server imports).
 *
 * Built-in columns: title,status,priority,assignee,start,due,description.
 * Custom fields ride as extra columns headed by the field name (or
 * `field:<name>` when the name collides with a built-in column or another
 * field). Person cells hold `Name <email>` entries separated by `;`; on import
 * a person resolves by email, then member id, then exact name (only when
 * unambiguous), or an agent name. Unknown / unparsable cells are skipped and
 * reported, never guessed.
 */
import {
  MAX_FIELD_OPTIONS,
  MAX_PERSON_CELL,
  cellPeople,
  cleanPersonRef,
  personCellLimit,
  personLabel,
  rowAssignees,
  type CellValue,
  type FieldDef,
  type PersonRef,
} from "@/lib/workspaceDbModel"

export const CSV_BUILTIN_COLUMNS = ["title", "status", "priority", "assignee", "start", "due", "description"] as const
export const MAX_CSV_IMPORT_ROWS = 200

export type CsvPerson = { id: string; name: string; email?: string }

/** Minimal CSV parser (quotes + embedded commas/newlines). Returns rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let cell = ""
  let quoted = false
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ",") {
      cur.push(cell)
      cell = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++
      cur.push(cell)
      cell = ""
      if (cur.length > 1 || cur[0].trim() !== "") rows.push(cur)
      cur = []
    } else {
      cell += ch
    }
  }
  cur.push(cell)
  if (cur.length > 1 || cur[0].trim() !== "") rows.push(cur)
  return rows
}

/** Spreadsheet apps run a cell starting with these as a formula: export them quoted with a leading `'`. */
const FORMULA_START = /^[=+@\t\r]|^-(?![\d.])/

export function csvGuard(v: string): string {
  return FORMULA_START.test(v) ? `'${v}` : v
}

/** Undo `csvGuard` (only for the characters it guards). */
export function csvUnguard(v: string): string {
  return /^'([=+@\t\r-])/.test(v) ? v.slice(1) : v
}

export function csvEscape(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n"
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/** `Name <email>` → email; otherwise the trimmed text. */
function splitPersonText(t: string): { email: string; text: string } {
  const m = /<([^<>]+)>\s*$/.exec(t)
  if (m) return { email: m[1].trim().toLowerCase(), text: t.slice(0, m.index).trim() }
  return { email: t.includes("@") && !/\s/.test(t) ? t.toLowerCase() : "", text: t }
}

/**
 * One CSV person token → a ref. Email (exact, case-insensitive) first, then
 * `user:<id>` / member id, then exact name (only when exactly one member has it),
 * then an agent (type or roster name). `null` when nothing matches.
 */
export function resolveCsvPerson(token: string, people: readonly CsvPerson[]): PersonRef | null {
  const raw = token.trim()
  if (!raw) return null
  const { email, text } = splitPersonText(raw)
  const asUser = (p: CsvPerson): PersonRef => cleanPersonRef({ kind: "user", id: p.id, name: p.name }) ?? { kind: "user", id: p.id }
  if (email) {
    const hit = people.find((p) => p.email && p.email.toLowerCase() === email)
    if (hit) return asUser(hit)
  }
  const key = text.startsWith("user:") ? text.slice(5) : text
  const byId = people.find((p) => p.id === key)
  if (byId) return asUser(byId)
  const byName = people.filter((p) => p.name.toLowerCase() === text.toLowerCase())
  if (byName.length === 1) return asUser(byName[0])
  if (byName.length > 1) return null
  const agent = text.startsWith("agent:") ? cleanPersonRef({ kind: "agent", type: text.slice(6) }) : rowAssignees(undefined, text)[0]
  return agent ?? null
}

function csvPersonText(p: PersonRef, people: readonly CsvPerson[]): string {
  if (p.kind === "agent") return personLabel(p)
  const hit = people.find((x) => x.id === p.id)
  const name = hit?.name || p.name || "Member"
  return hit?.email ? `${name} <${hit.email}>` : name
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

/** Rollups are computed, so they have no CSV column. */
export function csvFields(defs: readonly FieldDef[]): FieldDef[] {
  return defs.filter((d) => d.type !== "rollup")
}

/** Header text per exported custom field: its name, or `field:<name>` when that would be ambiguous. */
export function fieldHeaders(defs: readonly FieldDef[]): Map<string, string> {
  const taken = new Set<string>(CSV_BUILTIN_COLUMNS)
  const counts = new Map<string, number>()
  const fields = csvFields(defs)
  for (const d of fields) counts.set(d.name.toLowerCase(), (counts.get(d.name.toLowerCase()) ?? 0) + 1)
  const out = new Map<string, string>()
  for (const d of fields) {
    const n = d.name.toLowerCase()
    out.set(d.id, taken.has(n) || (counts.get(n) ?? 0) > 1 ? `field:${d.name}` : d.name)
  }
  return out
}

/**
 * Header row → column index per field id. Matches the exported header
 * (name or `field:<name>`), case-insensitively; an ambiguous bare name matches nothing.
 */
export function fieldColumns(header: readonly string[], defs: readonly FieldDef[]): Record<string, number> {
  const out: Record<string, number> = {}
  const heads = header.map((h) => csvUnguard(h).trim().toLowerCase())
  const fields = csvFields(defs)
  for (const d of fields) {
    const n = d.name.toLowerCase()
    const prefixed = heads.indexOf(`field:${n}`)
    if (prefixed >= 0) {
      out[d.id] = prefixed
      continue
    }
    const sameName = fields.filter((x) => x.name.toLowerCase() === n).length
    const builtin = (CSV_BUILTIN_COLUMNS as readonly string[]).includes(n)
    if (sameName === 1 && !builtin) {
      const i = heads.indexOf(n)
      if (i >= 0) out[d.id] = i
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

export type CsvCell = { value: CellValue } | { problem: string } | null

const TRUE_WORDS = new Set(["true", "yes", "y", "1", "x", "✓", "checked"])
const FALSE_WORDS = new Set(["false", "no", "n", "0", "unchecked"])

/** One CSV cell → a stored cell value; `null` = blank (leave unset), `{problem}` = skipped with a reason. */
export function csvCellValue(def: FieldDef, raw: string, people: readonly CsvPerson[]): CsvCell {
  const text = csvUnguard(raw).trim()
  if (!text) return null
  switch (def.type) {
    case "text":
    case "url":
      return { value: text }
    case "number": {
      const n = Number(text.replace(/,/g, ""))
      return Number.isFinite(n) ? { value: n } : { problem: `${def.name}: “${text}” is not a number` }
    }
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(text) ? { value: text } : { problem: `${def.name}: “${text}” is not a YYYY-MM-DD date` }
    case "checkbox": {
      const w = text.toLowerCase()
      if (TRUE_WORDS.has(w)) return { value: true }
      if (FALSE_WORDS.has(w)) return { value: false }
      return { problem: `${def.name}: “${text}” is not yes/no` }
    }
    case "select": {
      const hit = def.options.find((o) => o.toLowerCase() === text.toLowerCase())
      return hit ? { value: hit } : { problem: `${def.name}: “${text}” is not an option` }
    }
    case "multi": {
      const picked: string[] = []
      for (const part of text.split(";").map((t) => t.trim()).filter(Boolean)) {
        const hit = def.options.find((o) => o.toLowerCase() === part.toLowerCase())
        if (!hit) return { problem: `${def.name}: “${part}” is not an option` }
        if (!picked.includes(hit)) picked.push(hit)
      }
      return picked.length > 0 ? { value: picked.slice(0, MAX_FIELD_OPTIONS) } : null
    }
    case "relation": {
      const ids = text.split(";").map((t) => t.trim().slice(0, 64)).filter(Boolean)
      return ids.length > 0 ? { value: [...new Set(ids)] } : null
    }
    case "person": {
      const refs: PersonRef[] = []
      // `;` separates people; bare names / emails may also be comma-separated.
      const parts = text.includes(";") || text.includes("<") ? text.split(";") : text.split(",")
      for (const part of parts.map((t) => t.trim()).filter(Boolean)) {
        const ref = resolveCsvPerson(part, people)
        if (!ref) return { problem: `${def.name}: no member matches “${part}”` }
        if (!refs.some((r) => JSON.stringify(r) === JSON.stringify(ref))) refs.push(ref)
      }
      if (refs.length === 0) return null
      const limit = personCellLimit(def)
      if (refs.length > limit) return { problem: `${def.name}: at most ${limit} ${limit === 1 ? "person" : "people"}` }
      return { value: refs.slice(0, MAX_PERSON_CELL) }
    }
    case "rollup":
      return null
  }
}

/** All custom cells of one CSV row (blank / invalid cells are left out; invalid ones add a problem). */
export function csvRowCells(
  cells: readonly string[],
  columns: Record<string, number>,
  defs: readonly FieldDef[],
  people: readonly CsvPerson[],
): { cells: Record<string, CellValue>; problems: string[] } {
  const out: Record<string, CellValue> = {}
  const problems: string[] = []
  for (const d of csvFields(defs)) {
    const i = columns[d.id]
    if (i === undefined) continue
    const r = csvCellValue(d, cells[i] ?? "", people)
    if (!r) continue
    if ("problem" in r) problems.push(r.problem)
    else out[d.id] = r.value
  }
  return { cells: out, problems }
}

/** Stored cell → CSV text (inverse of `csvCellValue`). */
export function csvCellText(def: FieldDef, v: CellValue | undefined, people: readonly CsvPerson[]): string {
  if (v === undefined || v === null) return ""
  switch (def.type) {
    case "person":
      return cellPeople(v).map((p) => csvPersonText(p, people)).join("; ")
    case "checkbox":
      return v === true ? "yes" : v === false ? "no" : ""
    case "multi":
    case "relation":
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").join("; ") : ""
    case "rollup":
      return ""
    default:
      return String(v)
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export type CsvExportRow = {
  title: string
  status: string
  priority: string
  assignees: PersonRef[]
  assignee: string
  start: string
  due: string
  description: string
  cells: Record<string, CellValue>
}

/** Header + one line per task: built-in columns then each custom field. */
export function exportRowsCsv(rows: readonly CsvExportRow[], defs: readonly FieldDef[], people: readonly CsvPerson[]): string {
  const fields = csvFields(defs)
  const heads = fieldHeaders(defs)
  const out: string[][] = [[...CSV_BUILTIN_COLUMNS, ...fields.map((d) => heads.get(d.id) ?? d.name)].map(csvGuard)]
  for (const r of rows) {
    const assignee = r.assignees.length > 0 ? r.assignees.map((p) => csvPersonText(p, people)).join("; ") : r.assignee
    out.push(
      [r.title, r.status, r.priority, assignee, r.start, r.due, r.description, ...fields.map((d) => csvCellText(d, r.cells[d.id], people))].map(csvGuard),
    )
  }
  return toCsv(out)
}
