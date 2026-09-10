import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

// Regression test for the kanban "drop doesn't move the card" bug.
// Board edits (drag-drop, drawer fields, comments) mutate NESTED row maps
// via m.set(). A shallow Y.Array.observe never fires for those, so the
// board neither re-rendered nor scheduled its persist PUT. Like AFFiNE's
// data-view (every Yjs mutation flows to the UI), the board must observe
// deeply. This pins the Yjs semantics the fix relies on.
describe('workspace database observation depth', () => {
  it('shallow array observe misses nested row-map writes', () => {
    const doc = new Y.Doc()
    const yRows = doc.getArray<Y.Map<unknown>>('database')
    const m = new Y.Map<unknown>()
    m.set('id', 'r1')
    m.set('priority', 'Med')
    doc.transact(() => yRows.push([m]))
    let fires = 0
    const obs = () => { fires++ }
    yRows.observe(obs)
    doc.transact(() => { (yRows.get(0) as Y.Map<unknown>).set('priority', 'High') })
    yRows.unobserve(obs)
    expect(fires).toBe(0)
    doc.destroy()
  })

  it('deep observe catches nested row-map writes (drop path)', () => {
    const doc = new Y.Doc()
    const yRows = doc.getArray<Y.Map<unknown>>('database')
    const m = new Y.Map<unknown>()
    m.set('id', 'r1')
    m.set('priority', 'Med')
    doc.transact(() => yRows.push([m]))
    let fires = 0
    const obs = () => { fires++ }
    yRows.observeDeep(obs)
    // Same mutation updateRow performs on kanban drop:
    doc.transact(() => { (yRows.get(0) as Y.Map<unknown>).set('priority', 'High') })
    yRows.unobserveDeep(obs)
    expect(fires).toBeGreaterThan(0)
    expect((yRows.get(0) as Y.Map<unknown>).get('priority')).toBe('High')
    doc.destroy()
  })
})
