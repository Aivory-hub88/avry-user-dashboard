import { describe, it, expect } from 'vitest'
import { formatLocalAmount } from './resultFormatters'

describe('formatLocalAmount', () => {
  it('thousands mark follows the report language, not the currency', () => {
    expect(formatLocalAmount(1_342_500_235, 'IDR', 'en')).toBe('Rp 1,342,500,235')
    expect(formatLocalAmount(1_342_500_235, 'IDR', 'id')).toBe('Rp 1.342.500.235')
  })
  it('keeps the currency default when no locale is given', () => {
    expect(formatLocalAmount(1_342_500_235, 'IDR')).toBe('Rp 1.342.500.235')
  })
})
