import { describe, it, expect } from 'vitest'
import { dropCellKeys, dropFieldsFromRules, dropFieldsFromViews, removedFieldIds, type AutomationRule, type FieldDef } from './workspaceDbModel'

const f = (id: string): FieldDef => ({ id, name: id, type: 'text', options: [] })

describe('removedFieldIds', () => {
  it('lists ids that disappeared, ignores additions', () => {
    expect(removedFieldIds([f('a'), f('b')], [f('b'), f('c')])).toEqual(['a'])
    expect(removedFieldIds([], [f('a')])).toEqual([])
  })
})

describe('dropCellKeys', () => {
  it('removes the ids, null when nothing to remove or not an object', () => {
    expect(dropCellKeys({ a: 1, b: 2 }, new Set(['a']))).toEqual({ b: 2 })
    expect(dropCellKeys({ b: 2 }, new Set(['a']))).toBeNull()
    expect(dropCellKeys(undefined, new Set(['a']))).toBeNull()
    expect(dropCellKeys([1], new Set(['a']))).toBeNull()
  })
})

describe('dropFieldsFromViews', () => {
  const gone = new Set(['f1'])
  it('drops field filters, resets a sort on it, leaves others', () => {
    const out = dropFieldsFromViews(
      [
        { id: 'v', sortField: 'field:f1', fieldFilters: { f1: 'me', f2: 'me' } },
        { id: 'w', sortField: 'field:f2', fieldFilters: { f1: 'me' } },
        { id: 'x', sortField: 'due' },
      ],
      gone,
    )
    expect(out).toEqual([
      { id: 'v', sortField: 'title', fieldFilters: { f2: 'me' } },
      { id: 'w', sortField: 'field:f2' },
      { id: 'x', sortField: 'due' },
    ])
  })
  it('null when no view mentioned the field', () => {
    expect(dropFieldsFromViews([{ id: 'x', sortField: 'due' }], gone)).toBeNull()
    expect(dropFieldsFromViews(undefined, gone)).toBeNull()
  })
})

describe('dropFieldsFromRules', () => {
  const gone = new Set(['f1'])
  const rules: AutomationRule[] = [
    { id: '1', name: 'only field', whenStatus: 'Doing', setField: { fieldId: 'f1', to: 'owner' } },
    { id: '2', name: 'mixed', whenStatus: 'Doing', addComment: 'c', setField: { fieldId: 'f1', to: 'owner' } },
    { id: '3', name: 'other field', whenStatus: 'Doing', setField: { fieldId: 'f2', to: 'creator' } },
  ]
  it('drops the action, and the rule when it was its only one', () => {
    expect(dropFieldsFromRules(rules, gone)).toEqual([
      { id: '2', name: 'mixed', whenStatus: 'Doing', addComment: 'c' },
      rules[2],
    ])
  })
  it('null when unaffected', () => {
    expect(dropFieldsFromRules([rules[2]], gone)).toBeNull()
  })
})
