import * as Y from "yjs"
import { query } from "@/lib/db"
import { rowsFromDbDoc, wipExceeded } from "@/lib/workspaceDb"
import {
  parseAutomationRules,
  parseFieldDefs,
  parseStatusDefs,
  matchRules,
  assigneesFromRuleValue,
  assigneeMirror,
  addFollowers,
  addedFieldPeople,
  cellPeople,
  cleanOwner,
  cleanPersonRef,
  personCellLimit,
  personKey,
  personRefFromKey,
  readCells,
  rowFollowers,
  rowAssignees,
  type AutomationRule,
  type CellValue,
  type FieldDef,
  type FieldPeopleAdded,
  type PersonRef,
} from "@/lib/workspaceDbModel"

/**
 * Status-change automations (Fase 4e): when a row moves INTO a status, run
 * assignee/comment/move actions. Pure model + map mutation; routes own
 * persistence, WIP gating, and activity logging. Depth-1 only: chained
 * moveTo never re-triggers (no loops, ever).
 */

export type AppliedAutomation = {
  ruleId: string
  ruleName: string
  movedTo?: string
  skippedMoveWip?: boolean
  /** setField: the person field that was set, and who is newly in it (for "set you as" notices). */
  setField?: FieldPeopleAdded
}

/** Who a `setField` rule points at on this row (null when the row has no owner / creator). */
export function resolveRuleFieldTarget(m: Y.Map<unknown>, to: string): PersonRef | null {
  if (to === "owner") return cleanOwner(m.get("owner"))
  if (to === "creator") return cleanPersonRef(m.get("createdBy"))
  return personRefFromKey(to)
}

/**
 * Put `target` in a person field: a single-person field is replaced, a multi one
 * gets the person added once (deduped, capped). Returns the new cell list and
 * whether anything changed.
 */
export function personCellWith(current: PersonRef[], target: PersonRef, def: Pick<FieldDef, "single">): { list: PersonRef[]; changed: boolean } {
  const key = personKey(target)
  const limit = personCellLimit(def)
  if (def.single) {
    const same = current.length === 1 && personKey(current[0]) === key
    return { list: [target], changed: !same }
  }
  if (current.some((p) => personKey(p) === key)) return { list: current, changed: false }
  if (current.length >= limit) return { list: current, changed: false }
  return { list: [...current, target], changed: true }
}

/** Merge person-field additions per field (people deduped), keeping first-seen field order. */
export function mergeFieldAdds(...lists: ReadonlyArray<readonly FieldPeopleAdded[]>): FieldPeopleAdded[] {
  const out: FieldPeopleAdded[] = []
  for (const list of lists) {
    for (const f of list) {
      const hit = out.find((x) => x.fieldId === f.fieldId)
      if (!hit) out.push({ ...f, added: [...f.added] })
      else hit.added = [...hit.added, ...f.added.filter((p) => !hit.added.some((q) => personKey(q) === personKey(p)))]
    }
  }
  return out
}

/** The person-field additions of a batch of applied automations, merged per field. */
export function automatedFieldAdds(applied: readonly AppliedAutomation[]): FieldPeopleAdded[] {
  return mergeFieldAdds(applied.flatMap((a) => (a.setField ? [[a.setField]] : [])).flat())
}

/**
 * Apply one rule to a row map INSIDE the caller's transact. Returns what was
 * applied (for activity). moveTo is pre-gated by the caller against WIP via
 * `allowMove`; a denied move is reported, never forced.
 */
export function applyRuleToRow(
  m: Y.Map<unknown>,
  rule: AutomationRule,
  allowMove: boolean,
  actorName: string,
  fieldDefs: readonly FieldDef[] = [],
): AppliedAutomation {
  const applied: AppliedAutomation = { ruleId: rule.id, ruleName: rule.name }
  if (rule.setAssignee !== undefined) {
    const typed = assigneesFromRuleValue(rule.setAssignee)
    if (typed) {
      m.set("assignees", typed)
      m.set("assignee", assigneeMirror(typed))
    } else {
      // Old free-text rule: legacy string only (read as an unlinked assignee).
      m.delete("assignees")
      m.set("assignee", rule.setAssignee)
    }
  }
  if (rule.setField !== undefined) {
    const def = fieldDefs.find((d) => d.id === rule.setField!.fieldId && d.type === "person")
    const target = def ? resolveRuleFieldTarget(m, rule.setField.to) : null
    if (def && target) {
      const prevCells = readCells(m.get("cells"))
      const { list, changed } = personCellWith(cellPeople(prevCells[def.id]), target, def)
      if (changed) {
        const nextCells: Record<string, CellValue> = { ...prevCells, [def.id]: list }
        const added = addedFieldPeople(prevCells, nextCells, [def])
        m.set("cells", nextCells)
        if (added.length > 0) {
          applied.setField = added[0]
          // Newly set people follow the task, like a person set by hand.
          const createdBy = cleanPersonRef(m.get("createdBy"))
          const owner = cleanOwner(m.get("owner"))
          const assignees = rowAssignees(m.get("assignees"), m.get("assignee"))
          m.set("followers", addFollowers(rowFollowers(m.get("followers"), { createdBy, owner, assignees }), added[0].added))
        }
      }
    }
  }
  if (rule.moveTo !== undefined) {
    if (allowMove) {
      m.set("status", rule.moveTo)
      applied.movedTo = rule.moveTo
    } else {
      applied.skippedMoveWip = true
    }
  }
  if (rule.addComment !== undefined) {
    const raw = m.get("comments")
    const list = Array.isArray(raw) ? (raw as unknown[]) : []
    const comment = {
      id: `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      text: rule.addComment.slice(0, 500),
      author: actorName.slice(0, 100),
      at: new Date().toISOString(),
    }
    m.set("comments", [...list, comment].slice(-100))
  }
  return applied
}

/** Automation rules for a doc (empty when none configured). */
export async function getAutomationRules(docId: string): Promise<AutomationRule[]> {
  try {
    const r = await query(`SELECT props FROM dashboard.workspace_docs WHERE id = $1 OR id = $2 LIMIT 1`, [
      `workspace:${docId}`,
      docId,
    ])
    const props = r.rows[0]?.props as Record<string, unknown> | undefined
    return parseAutomationRules(props?.dbAutomations, parseStatusDefs(props?.dbStatuses), parseFieldDefs(props?.dbFields))
  } catch {
    return []
  }
}

/**
 * Load + run matching rules for a status entry, mutating the row map inside
 * ONE transact owned by the caller. Returns applied descriptors (for
 * activity); empty when nothing matched. moveTo is WIP-gated per rule.
 */
export async function runStatusAutomations(args: {
  doc: Y.Doc
  rowId: string
  prevStatus: string | null
  wipLimits: Record<string, number>
  actorName: string
  origin: string
  getRules: () => Promise<AutomationRule[]>
  /** The room's custom fields; only read when a matched rule sets a person field. */
  getFields?: () => Promise<FieldDef[]>
}): Promise<AppliedAutomation[]> {
  const arr = args.doc.getArray<Y.Map<unknown>>("database")
  const idx = arr.toArray().findIndex((m) => (m.get("id") as string) === args.rowId)
  if (idx < 0) return []
  const m = arr.get(idx) as Y.Map<unknown>
  const nextStatus = (m.get("status") as string) ?? "Todo"
  const rules = matchRules(await args.getRules(), args.prevStatus, nextStatus)
  if (rules.length === 0) return []
  const fieldDefs = rules.some((r) => r.setField) && args.getFields ? await args.getFields() : []
  const applied: AppliedAutomation[] = []
  args.doc.transact(() => {
    const rows = rowsFromDbDoc(args.doc)
    for (const rule of rules) {
      let allowMove = true
      if (rule.moveTo !== undefined) {
        const limited = wipExceeded(rows, rule.moveTo, args.wipLimits, args.rowId)
        allowMove = limited === null
      }
      applied.push(applyRuleToRow(m, rule, allowMove, args.actorName, fieldDefs))
    }
  }, args.origin)
  return applied
}
