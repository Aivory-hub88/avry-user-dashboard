import type { DiagnosticContext } from '@/types/diagnostic'
import ScoreRing from '@/components/result/ScoreRing'
import RadarChart from '@/components/result/RadarChart'
import {
  formatCurrency,
  formatPercent,
  formatMonths,
  humanizeDimensionKey,
  parseCurrencyCode,
  formatDate
} from '@/lib/resultFormatters'
import styles from './PrintableReport.module.css'

interface PrintableReportProps {
  context: DiagnosticContext
}

export default function PrintableReport({ context }: PrintableReportProps) {
  const { scores, calculations, opportunities, risks, company } = context
  const currencyCode = parseCurrencyCode(context.currency)
  const fmtCurrency = (v: number | null | undefined) => formatCurrency(v, currencyCode)
  
  const totalAnnualSavings = calculations.totalAnnualSavingsLocal ?? calculations.totalAnnualSavingsIDR ?? null
  const annualLaborSavings = calculations.annualLaborSavingsLocal ?? calculations.annualLaborSavingsIDR ?? null
  const annualProcessSavings = calculations.annualProcessSavingsLocal ?? calculations.annualProcessSavingsIDR ?? null
  const costOfInaction90Days = calculations.costOfInaction90DaysLocal ?? calculations.costOfInaction90DaysIDR ?? null

  const highRiskCount = risks.filter(r => r.severity === 'HIGH').length
  const quickWinCount = opportunities.filter(o => o.quadrant === 'quick_win').length

  const assessmentBullets = [
    { icon: '▲', text: `${company} scores ${scores.composite}/100, placing it at ${scores.maturityLevel} maturity.` },
    { icon: '▲', text: `Strongest dimension: ${humanizeDimensionKey(scores.strongestDimension)}.` },
    { icon: '▽', text: `Greatest gap: ${humanizeDimensionKey(scores.weakestDimension)}.` },
    { icon: '▽', text: `${highRiskCount} high-severity risk${highRiskCount !== 1 ? 's' : ''} identified.` },
    { icon: '▶', text: `${quickWinCount} quick-win opportunit${quickWinCount !== 1 ? 'ies' : 'y'} available.` },
  ]

  return (
    <div className={styles.printContainer}>
      <div className={styles.header}>
        <h1 className={styles.title}>AI Readiness Diagnostic</h1>
        <p className={styles.subtitle}>{company} • {formatDate(context.submittedAt)}</p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Executive Scorecard</h2>
        <div className={styles.scorecardRow}>
          <ScoreRing score={scores.composite} maturityLevel={scores.maturityLevel} isPrintMode={true} />
          <RadarChart scores={scores} isPrintMode={true} />
        </div>
        <ul className={styles.bulletList}>
          {assessmentBullets.map((b, i) => (
            <li key={i} className={styles.bulletItem}>
              <span className={styles.bulletIcon}>{b.icon}</span>
              <span>{b.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>ROI Projection</h2>
        <div className={styles.grid}>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>Total Annual Savings</div>
            <div className={styles.tileValue} style={totalAnnualSavings && totalAnnualSavings < 0 ? { color: '#dc2626' } : undefined}>{fmtCurrency(totalAnnualSavings)}</div>
          </div>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>Annual Labor Savings</div>
            <div className={styles.tileValue} style={annualLaborSavings && annualLaborSavings < 0 ? { color: '#dc2626' } : undefined}>{fmtCurrency(annualLaborSavings)}</div>
          </div>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>Annual Process Savings</div>
            <div className={styles.tileValue} style={annualProcessSavings && annualProcessSavings < 0 ? { color: '#dc2626' } : undefined}>{fmtCurrency(annualProcessSavings)}</div>
          </div>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>Payback Period</div>
            <div className={styles.tileValue} style={calculations.paybackMonths && calculations.paybackMonths < 0 ? { color: '#dc2626' } : undefined}>{formatMonths(calculations.paybackMonths)}</div>
          </div>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>3-Year ROI</div>
            <div className={styles.tileValue} style={(calculations.threeYearROIPercent ?? 0) < 0 ? { color: '#dc2626' } : undefined}>{(calculations.threeYearROIPercent ?? 0) >= 999 ? '>999%' : formatPercent(calculations.threeYearROIPercent ?? 0)}</div>
          </div>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>Cost of Inaction (90 Days)</div>
            <div className={styles.tileValue} style={costOfInaction90Days && costOfInaction90Days < 0 ? { color: '#dc2626' } : undefined}>{fmtCurrency(costOfInaction90Days)}</div>
          </div>
        </div>
      </div>
      
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Top Opportunities</h2>
        <ul className={styles.bulletList}>
          {opportunities.slice(0, 5).map(o => (
            <li key={o.id} className={styles.bulletItem}>
              <span className={styles.bulletIcon}>▶</span>
              <span><strong>{o.title}:</strong> {o.projectedROINote} ({fmtCurrency(o.estimatedSavingsLocal ?? o.estimatedSavingsIDR ?? null)})</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
