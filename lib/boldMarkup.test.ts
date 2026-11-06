import { describe, it, expect } from 'vitest'
import { splitBold } from './boldMarkup'

describe('splitBold', () => {
  it('marks the paired segments bold', () => {
    expect(splitBold('Your site has **online booking**, matching **manual scheduling**.')).toEqual([
      { text: 'Your site has ', bold: false },
      { text: 'online booking', bold: true },
      { text: ', matching ', bold: false },
      { text: 'manual scheduling', bold: true },
      { text: '.', bold: false },
    ])
  })
  it('leaves plain text alone and drops empty/unbalanced markers', () => {
    expect(splitBold('no markup')).toEqual([{ text: 'no markup', bold: false }])
    expect(splitBold('****')).toEqual([])
    expect(splitBold('open **never closed')).toEqual([{ text: 'open ', bold: false }, { text: 'never closed', bold: false }])
  })
  it('never interprets HTML', () => {
    expect(splitBold('<b>x</b> **y**')).toEqual([{ text: '<b>x</b> ', bold: false }, { text: 'y', bold: true }])
  })
})
