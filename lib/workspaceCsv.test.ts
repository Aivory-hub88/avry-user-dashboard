import { describe, it, expect } from 'vitest'
import {
  csvCellText,
  csvCellValue,
  csvGuard,
  csvRowCells,
  csvUnguard,
  exportRowsCsv,
  fieldColumns,
  fieldHeaders,
  parseCsv,
  resolveCsvPerson,
  toCsv,
  type CsvPerson,
} from './workspaceCsv'
import type { FieldDef } from './workspaceDbModel'

const people: CsvPerson[] = [
  { id: 'u1', name: 'Una Lee', email: 'Una@Example.com' },
  { id: 'u2', name: 'Bo Chen', email: 'bo@example.com' },
  { id: 'u3', name: 'Bo Chen', email: 'bo2@example.com' },
]
const f = (o: Partial<FieldDef> & Pick<FieldDef, 'id' | 'name' | 'type'>): FieldDef => ({ options: [], ...o })
const REV = f({ id: 'rev', name: 'Reviewer', type: 'person' })
const QA = f({ id: 'qa', name: 'QA', type: 'person', single: true })

describe('parseCsv / toCsv', () => {
  it('round-trips quotes, commas, newlines and a BOM', () => {
    const rows = [['a,b', 'say "hi"', 'x\ny'], ['', '2', 'z']]
    expect(parseCsv('﻿' + toCsv(rows))).toEqual(rows)
  })
  it('skips blank lines', () => {
    expect(parseCsv('a,b\n\n\nc,d\r\n')).toEqual([['a', 'b'], ['c', 'd']])
  })
})

describe('formula guard', () => {
  it('quotes formula starters but leaves negative numbers alone', () => {
    expect(csvGuard('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvGuard('+1 555')).toBe("'+1 555")
    expect(csvGuard('@cmd')).toBe("'@cmd")
    expect(csvGuard('- item')).toBe("'- item")
    expect(csvGuard('-5')).toBe('-5')
    expect(csvGuard('plain')).toBe('plain')
  })
  it('unguard inverts it and ignores a normal apostrophe', () => {
    for (const v of ['=SUM(A1)', '+1', '@x', '- item']) expect(csvUnguard(csvGuard(v))).toBe(v)
    expect(csvUnguard("'tis")).toBe("'tis")
  })
})

describe('resolveCsvPerson', () => {
  it('matches email case-insensitively, including the Name <email> form', () => {
    expect(resolveCsvPerson('una@example.com', people)).toEqual({ kind: 'user', id: 'u1', name: 'Una Lee' })
    expect(resolveCsvPerson('Whoever <BO@example.com>', people)).toEqual({ kind: 'user', id: 'u2', name: 'Bo Chen' })
  })
  it('matches member id and a unique name', () => {
    expect(resolveCsvPerson('user:u2', people)?.kind).toBe('user')
    expect(resolveCsvPerson('una lee', people)).toMatchObject({ id: 'u1' })
  })
  it('refuses an ambiguous name and unknown people', () => {
    expect(resolveCsvPerson('Bo Chen', people)).toBeNull()
    expect(resolveCsvPerson('Nobody', people)).toBeNull()
    expect(resolveCsvPerson('', people)).toBeNull()
  })
  it('resolves an agent by roster name or agent:<type>', () => {
    const a = resolveCsvPerson('agent:dealflow', people)
    expect(a === null || a.kind === 'agent').toBe(true)
  })
})

describe('csvCellValue', () => {
  it('number / date / checkbox', () => {
    expect(csvCellValue(f({ id: 'n', name: 'N', type: 'number' }), '1,200.5', people)).toEqual({ value: 1200.5 })
    expect(csvCellValue(f({ id: 'n', name: 'N', type: 'number' }), 'abc', people)).toHaveProperty('problem')
    expect(csvCellValue(f({ id: 'd', name: 'D', type: 'date' }), '2026-11-16', people)).toEqual({ value: '2026-11-16' })
    expect(csvCellValue(f({ id: 'd', name: 'D', type: 'date' }), '16/11/2026', people)).toHaveProperty('problem')
    expect(csvCellValue(f({ id: 'c', name: 'C', type: 'checkbox' }), 'Yes', people)).toEqual({ value: true })
    expect(csvCellValue(f({ id: 'c', name: 'C', type: 'checkbox' }), 'no', people)).toEqual({ value: false })
    expect(csvCellValue(f({ id: 'c', name: 'C', type: 'checkbox' }), 'maybe', people)).toHaveProperty('problem')
  })
  it('select / multi match options case-insensitively and reject unknown ones', () => {
    const sel = f({ id: 's', name: 'S', type: 'select', options: ['Red', 'Blue'] })
    expect(csvCellValue(sel, 'red', people)).toEqual({ value: 'Red' })
    expect(csvCellValue(sel, 'green', people)).toHaveProperty('problem')
    const mul = f({ id: 'm', name: 'M', type: 'multi', options: ['A', 'B'] })
    expect(csvCellValue(mul, 'a; B; a', people)).toEqual({ value: ['A', 'B'] })
    expect(csvCellValue(mul, 'A; Z', people)).toHaveProperty('problem')
  })
  it('blank cells are null (left unset)', () => {
    expect(csvCellValue(REV, '  ', people)).toBeNull()
  })
  it('person: several by email, name fallback, and a single field caps at one', () => {
    const r = csvCellValue(REV, 'una@example.com; Bo Chen <bo@example.com>', people)
    expect(r).toEqual({ value: [{ kind: 'user', id: 'u1', name: 'Una Lee' }, { kind: 'user', id: 'u2', name: 'Bo Chen' }] })
    expect(csvCellValue(QA, 'una@example.com; bo@example.com', people)).toHaveProperty('problem')
    expect(csvCellValue(QA, 'una@example.com', people)).toEqual({ value: [{ kind: 'user', id: 'u1', name: 'Una Lee' }] })
  })
  it('person: one unknown person drops the whole cell with a reason', () => {
    const r = csvCellValue(REV, 'una@example.com; ghost@example.com', people)
    expect(r).toEqual({ problem: 'Reviewer: no member matches “ghost@example.com”' })
  })
  it('person: bare comma-separated names work when no email brackets are used', () => {
    const r = csvCellValue(REV, 'Una Lee, bo@example.com', people)
    expect(r).toMatchObject({ value: [{ id: 'u1' }, { id: 'u2' }] })
  })
})

describe('headers + columns', () => {
  it('uses the bare name, or field:<name> when it clashes with a built-in or another field', () => {
    const defs = [f({ id: 'a', name: 'Status', type: 'text' }), f({ id: 'b', name: 'Reviewer', type: 'person' }), f({ id: 'c', name: 'reviewer', type: 'text' }), f({ id: 'r', name: 'Roll', type: 'rollup', relationFieldId: 'x' })]
    const h = fieldHeaders(defs)
    expect(h.get('a')).toBe('field:Status')
    expect(h.get('b')).toBe('field:Reviewer')
    expect(h.get('c')).toBe('field:reviewer')
    expect(h.has('r')).toBe(false)
  })
  it('finds columns by name or field: prefix; ambiguous bare names match nothing', () => {
    const defs = [REV, f({ id: 'a', name: 'Status', type: 'text' }), f({ id: 'x', name: 'Dup', type: 'text' }), f({ id: 'y', name: 'dup', type: 'text' })]
    const cols = fieldColumns(['title', 'status', 'reviewer', 'field:Status', 'dup'], defs)
    expect(cols).toEqual({ rev: 2, a: 3 })
  })
})

describe('row cells + export round trip', () => {
  const defs: FieldDef[] = [
    REV,
    f({ id: 'pr', name: 'PR link', type: 'url' }),
    f({ id: 'ok', name: 'Approved', type: 'checkbox' }),
    f({ id: 'tag', name: 'Tags', type: 'multi', options: ['A', 'B'] }),
  ]
  const row = {
    title: '=evil, "quoted"',
    status: 'Doing',
    priority: 'High',
    assignees: [{ kind: 'user' as const, id: 'u2', name: 'Bo Chen' }],
    assignee: 'Bo Chen',
    start: '',
    due: '2026-12-01',
    description: '- first\nsecond',
    cells: {
      rev: [{ kind: 'user' as const, id: 'u1', name: 'Una Lee' }],
      pr: 'https://x.test/1',
      ok: true,
      tag: ['A', 'B'],
    },
  }
  it('exports people as Name <email> and imports them back unchanged', () => {
    const csv = exportRowsCsv([row], defs, people)
    const parsed = parseCsv(csv)
    expect(parsed[0]).toEqual(['title', 'status', 'priority', 'assignee', 'start', 'due', 'description', 'Reviewer', 'PR link', 'Approved', 'Tags'])
    expect(parsed[1][0]).toBe("'=evil, \"quoted\"")
    expect(parsed[1][7]).toBe('Una Lee <Una@Example.com>')
    const cols = fieldColumns(parsed[0], defs)
    const back = csvRowCells(parsed[1], cols, defs, people)
    expect(back.problems).toEqual([])
    expect(back.cells).toEqual(row.cells)
  })
  it('reports unmatched cells but keeps the rest of the row', () => {
    const cols = fieldColumns(['title', 'Reviewer', 'Tags', 'PR link'], defs)
    const r = csvRowCells(['t', 'ghost@example.com', 'Z', 'https://ok.test'], cols, defs, people)
    expect(r.cells).toEqual({ pr: 'https://ok.test' })
    expect(r.problems).toHaveLength(2)
  })
  it('csvCellText mirrors csvCellValue for checkbox/multi/person', () => {
    expect(csvCellText(defs[2], false, people)).toBe('no')
    expect(csvCellText(defs[3], ['A', 'B'], people)).toBe('A; B')
    expect(csvCellText(REV, [{ kind: 'user', id: 'zz', name: 'Gone' }], people)).toBe('Gone')
  })
})
