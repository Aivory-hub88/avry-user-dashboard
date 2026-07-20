'use client'

import { useMemo, useState } from 'react'
import type { DiagnosticContext, ROIProjection } from '@/types/diagnostic'
import { recomputeROIAtEfficiency, EFFICIENCY_SCENARIO_BOUNDS } from '@/services/deepDiagnostic'
import styles from './EfficiencyWhatIfSlider.module.css'

interface EfficiencyWhatIfSliderProps {
  /** Only the fields the ROI formula needs — never the whole page context, to make the read-only contract obvious at the call site. */
  context: Pick<DiagnosticContext, 'quantitative' | 'currency' | 'qualitative'>
  /** The report's real, saved calculations — used for the "not simulating" display and as the slider's default position. */
  calculations: ROIProjection
  fmtLocal: (v: number | null | undefined) => string
  formatMonths: (v: number | null | undefined) => string
  formatPercent: (v: number | null | undefined) => string
}

/**
 * Phase E2.4 — what-if efficiency slider.
 *
 * CRITICAL (brief §8 E-invariant 3): this component is a pure client-side
 * simulation. It:
 *  - keeps the simulated efficiency + recomputed figures in LOCAL component
 *    state only (`useState`/`useMemo` below) — it never assigns to, mutates,
 *    or dispatches an update to the loaded `DiagnosticContext`/`calculations`
 *    object it was handed as a prop;
 *  - never calls `DeepDiagnosticService.saveResult`, `lib/reportStorage.ts`,
 *    or any `/api/storage/*` endpoint — there is no save/POST code path
 *    anywhere in this file, verifiable by the absence of any fetch/import of
 *    those modules;
 *  - visually reads as "not simulating" (real saved figures, no badge) when
 *    the slider sits at the report's real assumed efficiency, and only
 *    shows the "Simulation" framing once the user actually moves it.
 */
export default function EfficiencyWhatIfSlider({
  context,
  calculations,
  fmtLocal,
  formatMonths,
  formatPercent,
}: EfficiencyWhatIfSliderProps) {
  const assumedEfficiency = calculations.efficiencyFactor ?? 0.75
  const defaultPct = Math.round(assumedEfficiency * 100)
  const lowPct = Math.round(EFFICIENCY_SCENARIO_BOUNDS.low * 100)
  const highPct = Math.round(EFFICIENCY_SCENARIO_BOUNDS.high * 100)

  // Local-only simulation state — starts at the report's real assumed
  // efficiency, expressed as a whole-number percent for the <input>.
  const [sliderPct, setSliderPct] = useState(defaultPct)

  const isSimulating = sliderPct !== defaultPct

  // Recomputed client-side only, from the shared pure formula. This is a
  // fresh object every render — it is never written back onto `context` or
  // `calculations`. Contexts missing `quantitative` (very old stored
  // reports) can't be recomputed — recomputeROIAtEfficiency returns null in
  // that case and we fall back to the real saved figures below.
  const simulated = useMemo(
    () => (isSimulating ? recomputeROIAtEfficiency(context, sliderPct / 100) : null),
    [context, sliderPct, isSimulating]
  )

  if (!context.quantitative) return null

  const display = simulated ?? calculations

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <span className={styles.heading}>What-if: efficiency scenario</span>
        {isSimulating ? (
          <span className={styles.simulationBadge}>Simulation</span>
        ) : (
          <span className={styles.realBadge}>Your saved report</span>
        )}
      </div>

      <p className={styles.caption}>
        {isSimulating
          ? `Simulation — your report assumes ${defaultPct}% efficiency. Adjust to explore scenarios; this does not change your saved report.`
          : `Your report assumes ${defaultPct}% automation efficiency. Drag the slider to see how the figures below would change — nothing here is saved.`}
      </p>

      <input
        type="range"
        min={lowPct}
        max={highPct}
        step={1}
        value={sliderPct}
        onChange={(e) => setSliderPct(Number(e.target.value))}
        className={styles.slider}
        aria-label="Simulated automation efficiency factor"
        aria-valuetext={`${sliderPct}%`}
      />
      <div className={styles.sliderScale}>
        <span>{lowPct}%</span>
        <span className={styles.sliderScaleValue}>{sliderPct}%</span>
        <span>{highPct}%</span>
      </div>

      <div className={styles.tileGrid}>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Business Value Created</span>
          <span className={styles.tileValue}>{fmtLocal(display.totalAnnualSavingsLocal)}</span>
        </div>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Recovered Team Capacity</span>
          <span className={styles.tileValue}>
            {display.hoursReclaimedPerYear != null ? `${Math.round(display.hoursReclaimedPerYear).toLocaleString('en-US')} hours` : '—'}
          </span>
        </div>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Payback Period</span>
          <span className={styles.tileValue}>{formatMonths(display.paybackMonths)}</span>
        </div>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>3-Year ROI</span>
          <span className={styles.tileValue}>
            {display.threeYearROIPercent != null
              ? (display.threeYearROIPercent >= 999 ? '>999%' : formatPercent(display.threeYearROIPercent))
              : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}
