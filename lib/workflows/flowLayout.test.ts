import { describe, it, expect } from 'vitest'
import { layoutLeftToRight, COLUMN_WIDTH, ROW_HEIGHT } from './flowLayout'

const e = (source: string, target: string) => ({ source, target })

describe('layoutLeftToRight', () => {
  it('lays a chain out left to right on one row', () => {
    const p = layoutLeftToRight(['a', 'b', 'c'], [e('a', 'b'), e('b', 'c')])
    expect([...p.values()].map((v) => v.x)).toEqual([0, COLUMN_WIDTH, 2 * COLUMN_WIDTH])
    expect(new Set([...p.values()].map((v) => v.y)).size).toBe(1)
  })

  it('fans a branch out above and below, and puts the join after both branches', () => {
    const ids = ['if', 'hot1', 'hot2', 'cold', 'join', 'wait']
    const p = layoutLeftToRight(ids, [e('if', 'hot1'), e('hot1', 'hot2'), e('if', 'cold'), e('hot2', 'join'), e('cold', 'join'), e('join', 'wait')])
    expect(p.get('hot1')!.x).toBe(p.get('cold')!.x)
    expect(p.get('hot1')!.y).not.toBe(p.get('cold')!.y)
    expect(p.get('join')!.x).toBeGreaterThan(p.get('hot2')!.x)
    expect(p.get('wait')!.x).toBeGreaterThan(p.get('join')!.x)
    expect(p.get('if')!.y).toBe(0)
    expect(Math.abs(p.get('hot1')!.y - p.get('cold')!.y)).toBe(ROW_HEIGHT)
  })

  it('applies the origin and survives a loop-back edge', () => {
    const p = layoutLeftToRight(['loop', 'body'], [e('loop', 'body'), e('body', 'loop')], { x: 100, y: 500 })
    expect(p.get('loop')!.x).toBe(100)
    expect(p.get('body')!.x).toBeGreaterThanOrEqual(100)
  })

  it('ignores edges to unknown nodes', () => {
    expect(layoutLeftToRight(['a'], [e('a', 'zzz')]).get('a')).toEqual({ x: 0, y: 0 })
  })
})

describe('AI sub-nodes', () => {
  it('sit under the node they feed, not in the first column', () => {
    const p = layoutLeftToRight(['read', 'agent', 'model'], [e('read', 'agent'), e('model', 'agent')], { x: 0, y: 0 }, [{ id: 'model', parent: 'agent' }])
    expect(p.get('model')).toEqual({ x: p.get('agent')!.x, y: p.get('agent')!.y + 200 })
    expect(p.get('agent')!.x).toBe(COLUMN_WIDTH)
  })
})

describe('lanes', () => {
  it('keeps a branch on its own straight lane so no edge passes behind another branch', () => {
    // if -> (create -> notify) | add -> join
    const p = layoutLeftToRight(['if', 'create', 'notify', 'add', 'join'], [e('if', 'create'), e('create', 'notify'), e('if', 'add'), e('notify', 'join'), e('add', 'join')])
    expect(p.get('notify')!.y).toBe(p.get('create')!.y)
    expect(p.get('add')!.y).toBeGreaterThan(p.get('create')!.y)
    expect(p.get('join')!.y).toBe((p.get('notify')!.y + p.get('add')!.y) / 2)
    // the add -> join edge runs below the notify node's row
    expect(p.get('add')!.y).toBeGreaterThanOrEqual(p.get('notify')!.y + ROW_HEIGHT)
  })
})
