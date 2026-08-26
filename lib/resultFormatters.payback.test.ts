import { describe, it, expect } from 'vitest'
import { formatPaybackCapped, formatMonths } from './resultFormatters'

describe('formatPaybackCapped — absurd paybacks stop reading as precise forecasts', () => {
  it('caps beyond 60 months at "> 5 tahun" / "> 5 yrs"', () => {
    expect(formatPaybackCapped(216, 'id')).toBe('> 5 tahun') // the 18-year net payback case
    expect(formatPaybackCapped(216, 'en')).toBe('> 5 yrs')
    expect(formatPaybackCapped(61, 'en')).toBe('> 5 yrs')
  })

  it('leaves sane paybacks to formatMonths untouched', () => {
    expect(formatPaybackCapped(47, 'id')).toBe(formatMonths(47, 'id'))
    expect(formatPaybackCapped(9, 'en')).toBe('9 months')
    expect(formatPaybackCapped(24, 'id')).toBe('2,0 tahun')
  })

  it('null/invalid → em dash, same as formatMonths', () => {
    expect(formatPaybackCapped(null)).toBe('—')
    expect(formatPaybackCapped(NaN)).toBe('—')
  })
})
