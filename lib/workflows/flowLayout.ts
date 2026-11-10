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

/** A Chat Model / Memory / Tool node that feeds `parent` through an ai_* connection; it sits under its parent. */
export interface SubNode { id: string; parent: string }

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
  subNodes: SubNode[] = [],
): Map<string, { x: number; y: number }> {
  const subIds = new Set(subNodes.filter((s) => ids.includes(s.parent)).map((s) => s.id))
  const mainIds = ids.filter((id) => !subIds.has(id))
  const placed = layoutMain(mainIds, edges, origin)
  const perParent = new Map<string, number>()
  for (const s of subNodes) {
    const p = placed.get(s.parent)
    if (!p || !subIds.has(s.id)) continue
    const k = perParent.get(s.parent) ?? 0
    perParent.set(s.parent, k + 1)
    placed.set(s.id, { x: p.x + k * 180, y: p.y + 200 })
  }
  return placed
}

function layoutMain(
  ids: string[],
  edges: LayoutEdge[],
  origin: { x: number; y: number },
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
    // Each node aims for the average row of its parents, so a single-child chain
    // stays on a straight line and a branch keeps its own lane instead of being
    // re-centred behind another branch's nodes. Then push overlapping rows apart
    // and re-centre the column on where the nodes wanted to be.
    const placed: number[] = []
    ordered.forEach(({ k }, idx) => placed.push(idx === 0 ? k : Math.max(k, placed[idx - 1] + ROW_HEIGHT)))
    const shift = ordered.reduce((s, { k }, idx) => s + k - placed[idx], 0) / ordered.length
    ordered.forEach(({ id }, idx) => {
      const y = placed[idx] + shift
      row.set(id, y)
      out.set(id, { x: origin.x + l * COLUMN_WIDTH, y: origin.y + y })
    })
  }
  return out
}

type Pos = { x: number; y: number }

/**
 * Positions after an edit that added steps. Nodes that were already on the canvas
 * keep exactly where they are; each new node goes one column to the right of its
 * parents (fanning out the way the fresh layout does when it has siblings), and
 * everything downstream of it that would now collide is shifted right as a block
 * so the flow keeps its shape. Finally any new node that still lands on top of
 * another node is nudged down a row.
 */
export function placeEditedNodes(args: {
  ids: string[]
  edges: LayoutEdge[]
  /** Positions of the nodes that already exist (keyed by their id in the new graph). */
  kept: Map<string, Pos>
  /** Positions the fresh layout gave every node of the new graph. */
  fresh: Map<string, Pos>
}): Map<string, Pos> {
  const { ids, edges, kept, fresh } = args
  const known = new Set(ids)
  const links = edges.filter((e) => known.has(e.source) && known.has(e.target) && e.source !== e.target)
  const pos = new Map<string, Pos>(kept)
  const added = ids
    .filter((id) => !kept.has(id))
    .sort((a, b) => (fresh.get(a)?.x ?? 0) - (fresh.get(b)?.x ?? 0) || (fresh.get(a)?.y ?? 0) - (fresh.get(b)?.y ?? 0))

  // Where the fresh layout and the canvas disagree on average: used for new nodes with no parent.
  const both = [...kept.keys()].filter((id) => fresh.has(id))
  const offset = both.length
    ? {
        x: both.reduce((s, id) => s + kept.get(id)!.x - fresh.get(id)!.x, 0) / both.length,
        y: both.reduce((s, id) => s + kept.get(id)!.y - fresh.get(id)!.y, 0) / both.length,
      }
    : { x: 0, y: 0 }

  const downstream = (start: string): string[] => {
    const seen = new Set<string>([start])
    const queue = [start]
    while (queue.length) {
      const id = queue.shift()!
      for (const e of links) if (e.source === id && !seen.has(e.target)) { seen.add(e.target); queue.push(e.target) }
    }
    seen.delete(start)
    return [...seen]
  }

  for (const id of added) {
    const f = fresh.get(id) ?? { x: 0, y: 0 }
    const parents = links.filter((e) => e.target === id && pos.has(e.source)).map((e) => e.source)
    let p: Pos
    if (parents.length) {
      const px = parents.map((q) => pos.get(q)!)
      const py = px.reduce((s, q) => s + q.y, 0) / px.length
      const fy = parents.reduce((s, q) => s + (fresh.get(q)?.y ?? f.y), 0) / parents.length
      p = { x: Math.max(...px.map((q) => q.x)) + COLUMN_WIDTH, y: py + (f.y - fy) }
    } else {
      p = { x: f.x + offset.x, y: f.y + offset.y }
    }
    pos.set(id, p)

    // Make room: slide everything already placed downstream of this node to the right.
    const after = downstream(id).filter((d) => kept.has(d))
    if (after.length) {
      const need = p.x + COLUMN_WIDTH - Math.min(...after.map((d) => pos.get(d)!.x))
      if (need > 0) for (const d of after) pos.set(d, { x: pos.get(d)!.x + need, y: pos.get(d)!.y })
    }
  }

  // Keep new nodes off other nodes.
  for (const id of added) {
    let p = pos.get(id)!
    for (let i = 0; i < 20; i++) {
      const hit = [...pos.entries()].some(([other, q]) => other !== id && Math.abs(q.x - p.x) < COLUMN_WIDTH * 0.8 && Math.abs(q.y - p.y) < ROW_HEIGHT * 0.6)
      if (!hit) break
      p = { x: p.x, y: p.y + ROW_HEIGHT }
    }
    pos.set(id, p)
  }
  return pos
}
