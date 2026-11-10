import { describe, it, expect } from 'vitest'
import { layoutLeftToRight, placeEditedNodes, COLUMN_WIDTH, ROW_HEIGHT } from './flowLayout'

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

describe('placeEditedNodes', () => {
  const P = (x: number, y: number) => ({ x, y })

  it('keeps existing nodes where they are and appends a new step after its parent', () => {
    const kept = new Map([['a', P(10, 20)], ['b', P(500, 90)]])
    const fresh = layoutLeftToRight(['a', 'b', 'c'], [e('a', 'b'), e('b', 'c')])
    const out = placeEditedNodes({ ids: ['a', 'b', 'c'], edges: [e('a', 'b'), e('b', 'c')], kept, fresh })
    expect(out.get('a')).toEqual(P(10, 20))
    expect(out.get('b')).toEqual(P(500, 90))
    expect(out.get('c')).toEqual(P(500 + COLUMN_WIDTH, 90))
  })

  it('makes room when a step is inserted in the middle', () => {
    // a -> b -> c existed; the edit makes it a -> new -> b -> c
    const kept = new Map([['a', P(0, 0)], ['b', P(COLUMN_WIDTH, 0)], ['c', P(2 * COLUMN_WIDTH, 0)]])
    const edges = [e('a', 'new'), e('new', 'b'), e('b', 'c')]
    const fresh = layoutLeftToRight(['a', 'new', 'b', 'c'], edges)
    const out = placeEditedNodes({ ids: ['a', 'new', 'b', 'c'], edges, kept, fresh })
    expect(out.get('new')).toEqual(P(COLUMN_WIDTH, 0))
    expect(out.get('b')).toEqual(P(2 * COLUMN_WIDTH, 0))
    expect(out.get('c')).toEqual(P(3 * COLUMN_WIDTH, 0))
    expect(out.get('a')).toEqual(P(0, 0))
  })

  it('does not put a new branch node on top of an existing one', () => {
    const kept = new Map([['if', P(0, 0)], ['yes', P(COLUMN_WIDTH, 0)]])
    const edges = [e('if', 'yes'), e('if', 'extra')]
    const fresh = layoutLeftToRight(['if', 'yes', 'extra'], edges)
    const out = placeEditedNodes({ ids: ['if', 'yes', 'extra'], edges, kept, fresh })
    const a = out.get('yes')!, b = out.get('extra')!
    expect(Math.abs(a.x - b.x) < COLUMN_WIDTH * 0.8 && Math.abs(a.y - b.y) < ROW_HEIGHT * 0.6).toBe(false)
  })

  it('places a new root from the fresh layout, aligned to the canvas', () => {
    const kept = new Map([['a', P(1000, 500)]])
    const out = placeEditedNodes({ ids: ['t', 'a'], edges: [e('t', 'a')], kept, fresh: new Map([['t', P(0, 0)], ['a', P(COLUMN_WIDTH, 0)]]) })
    expect(out.get('t')).toEqual(P(1000 - COLUMN_WIDTH, 500))
  })
})
