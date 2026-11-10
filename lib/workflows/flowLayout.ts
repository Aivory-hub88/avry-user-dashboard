/**
 * Left-to-right layout for nodes added to an existing canvas (Aether "add to the
 * current workflow", "add with copilot"). n8nToReactFlow lays out a whole n8n
 * workflow the same way (column per level); this covers the injection paths that
 * only have React Flow nodes and edges, and used to stack everything vertically
 * at x = 0, which made every edge loop back across the canvas.
 */

export const COLUMN_WIDTH = 320
export const ROW_HEIGHT = 180

export interface LayoutEdge { source: string; target: string }

/** Loop-back edges (Split In Batches ... -> loop) would push a loop to the far right; layout ignores them. */
function dropBackEdges(ids: string[], edges: LayoutEdge[]): LayoutEdge[] {
  const out = new Map<string, LayoutEdge[]>(ids.map((id) => [id, []]))
  const hasParent = new Set<string>()
  for (const e of edges) { out.get(e.source)!.push(e); hasParent.add(e.target) }
  const back = new Set<LayoutEdge>()
  const state = new Map<string, 1 | 2>() // 1 = on the current path, 2 = done
  const visit = (id: string) => {
    state.set(id, 1)
    for (const e of out.get(id)!) {
      const st = state.get(e.target)
      if (st === 1) back.add(e)
      else if (!st) visit(e.target)
    }
    state.set(id, 2)
  }
  const roots = ids.filter((id) => !hasParent.has(id))
  for (const id of roots.length ? roots : ids.slice(0, 1)) if (!state.has(id)) visit(id)
  for (const id of ids) if (!state.has(id)) visit(id)
  return edges.filter((e) => !back.has(e))
}

/**
 * Column = longest path from a root (so a join lands after all its branches),
 * row = order within the column by the average row of its parents, which keeps
 * branches from crossing. Columns are centred on y = 0 so a fan-out grows up
 * and down from the main line, as in n8n.
 */
export function layoutLeftToRight(
  ids: string[],
  edges: LayoutEdge[],
  origin: { x: number; y: number } = { x: 0, y: 0 },
): Map<string, { x: number; y: number }> {
  const known = new Set(ids)
  const all = edges.filter((e) => known.has(e.source) && known.has(e.target) && e.source !== e.target)
  const links = dropBackEdges(ids, all)
  const parents = new Map<string, string[]>(ids.map((id) => [id, []]))
  const children = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const e of links) {
    parents.get(e.target)!.push(e.source)
    children.get(e.source)!.push(e.target)
  }

  // Longest-path levels with a visit budget so loop-back edges cannot spin forever.
  const level = new Map<string, number>(ids.map((id) => [id, 0]))
  const budget = new Map<string, number>()
  const queue = ids.filter((id) => parents.get(id)!.length === 0)
  if (queue.length === 0 && ids.length) queue.push(ids[0])
  while (queue.length) {
    const id = queue.shift()!
    const n = (budget.get(id) ?? 0) + 1
    budget.set(id, n)
    if (n > ids.length + 2) continue
    for (const child of children.get(id)!) {
      if (level.get(id)! + 1 > level.get(child)!) {
        level.set(child, level.get(id)! + 1)
        queue.push(child)
      }
    }
  }

  const columns = new Map<number, string[]>()
  for (const id of ids) {
    const l = level.get(id)!
    if (!columns.has(l)) columns.set(l, [])
    columns.get(l)!.push(id)
  }

  const row = new Map<string, number>()
  const out = new Map<string, { x: number; y: number }>()
  for (const l of [...columns.keys()].sort((a, b) => a - b)) {
    const col = columns.get(l)!
    const key = (id: string) => {
      const ps = parents.get(id)!.filter((p) => row.has(p))
      return ps.length ? ps.reduce((s, p) => s + row.get(p)!, 0) / ps.length : 0
    }
    const ordered = col.map((id, i) => ({ id, i, k: key(id) })).sort((a, b) => a.k - b.k || a.i - b.i)
    ordered.forEach(({ id }, idx) => {
      const y = (idx - (ordered.length - 1) / 2) * ROW_HEIGHT
      row.set(id, y)
      out.set(id, { x: origin.x + l * COLUMN_WIDTH, y: origin.y + y })
    })
  }
  return out
}
