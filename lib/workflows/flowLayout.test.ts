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
