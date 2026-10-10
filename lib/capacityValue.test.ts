import { describe, it, expect, beforeEach } from 'vitest'
import { buildDiagnosticContext } from '@/services/deepDiagnostic'
import { buildCapacityValueView } from './capacityValueView'
import { DEEP_DIAGNOSTIC_PHASES } from '@/constants/deepDiagnosticQuestions'
import { ID_QUESTION_COPY } from '@/constants/deepDiagnosticQuestionsId'

beforeEach(() => {
  ;(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
})

// The screenshot case: 70 h/week manual, gap 17.5% → 62.5% (45 pts), IDR logistics.
const BASE = {
  currency: 'IDR — Indonesian Rupiah (Rp)', industry: 'Logistics / Supply Chain',
  manual_hours_weekly: '50-100 hours/week', fte_count: '16-50 FTEs',
  automation_current: '10-25%', target_automation: '50-75%',
}

describe('capacity value', () => {
  it('counts only the growth increment, absorbed share × 75% × 50% realization', () => {
    const k: any = buildDiagnosticContext({ ...BASE, volume_growth_12m: '50-75%' } as any).calculations
    // 70 × 52 × 0.625 growth × 0.45 gap × 0.75 eff × 0.5 realization
    expect(k.capacityAvoidedHoursPerYear).toBe(Math.round(70 * 52 * 0.625 * 0.45 * 0.75 * 0.5))
    expect(k.capacityAvoidanceUSD).toBeCloseTo(k.capacityAvoidedHoursPerYear * k.assumedHourlyRateUSD, 6)
    expect(k.horizonROIWithCapacityPercent).toBeGreaterThan(k.horizonROIPercent)
  })

  it('never touches the headline savings or ROI', () => {
    const without: any = buildDiagnosticContext({ ...BASE } as any).calculations
    const withGrowth: any = buildDiagnosticContext({ ...BASE, volume_growth_12m: 'More than 100%' } as any).calculations
    expect(withGrowth.totalAnnualSavingsUSD).toBe(without.totalAnnualSavingsUSD)
    expect(withGrowth.horizonROIPercent).toBe(without.horizonROIPercent)
    expect(withGrowth.npvHorizonUSD).toBe(without.npvHorizonUSD)
  })

  it('is absent for no growth, "Not sure", no answer, or no automation gap', () => {
    for (const v of ['No growth expected', 'Not sure', undefined]) {
      const k: any = buildDiagnosticContext({ ...BASE, volume_growth_12m: v } as any).calculations
      expect(k.capacityAvoidanceUSD).toBeNull()
    }
    const noGap: any = buildDiagnosticContext({ ...BASE, automation_current: '75-100%', volume_growth_12m: '75-100%' } as any).calculations
    expect(noGap.capacityAvoidanceUSD).toBeNull()
  })
})

describe('growth bands', () => {
  it('rise monotonically across the 25–100% range; the legacy 50-100% band still resolves', () => {
    const hours = (v: string) => (buildDiagnosticContext({ ...BASE, volume_growth_12m: v } as any).calculations as any).capacityAvoidedHoursPerYear
    const series = ['Up to 25%', '25-50%', '50-75%', '75-100%', 'More than 100%'].map(hours)
    for (let i = 1; i < series.length; i++) expect(series[i]).toBeGreaterThan(series[i - 1])
    expect(hours('50-100%')).toBeGreaterThan(hours('50-75%'))
    expect(hours('50-100%')).toBeLessThan(hours('75-100%'))
  })
})

describe('buildCapacityValueView', () => {
  const fmt = (v: number) => `Rp ${Math.round(v).toLocaleString('id-ID')}`
  it('renders the separate line with FTE equivalent and ROI with/without, in Indonesian', () => {
    const k: any = buildDiagnosticContext({ ...BASE, volume_growth_12m: 'More than 100%' } as any).calculations
    const v = buildCapacityValueView(k, fmt, 'id')!
    expect(v.title).toContain('bergantung pada pertumbuhan')
    expect(v.explanation).toContain('tidak dimasukkan ke angka-angka di atas')
    expect(v.rows.map((r) => r.label)).toContain('Biaya rekrutmen yang dihindari')
    expect(v.rows.find((r) => r.label.startsWith('Jam kerja'))!.value).toMatch(/FTE/)
    expect(v.rows.at(-1)!.value).toContain('tanpa:')
    expect(v.footnote).toContain('potongan realisasi 50%')
  })
  it('is null without a growth answer', () => {
    expect(buildCapacityValueView(buildDiagnosticContext({ ...BASE } as any).calculations as any, fmt, 'en')).toBeNull()
  })
})

describe('volume_growth_12m question', () => {
  it('has Indonesian options aligned one-to-one with the canonical ones', () => {
    const q = DEEP_DIAGNOSTIC_PHASES.flatMap((p) => p.questions).find((x) => x.id === 'volume_growth_12m')!
    expect(q.required).toBe(false)
    expect(ID_QUESTION_COPY.volume_growth_12m.options).toHaveLength(q.options!.length)
  })
})
