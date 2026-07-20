import type { DiagnosticContext } from '@/types/diagnostic'
import ScoreRing from '@/components/result/ScoreRing'
import RadarChart from '@/components/result/RadarChart'
import {
  formatLocalAmount,
  formatPercent,
  formatMonths,
  humanizeDimensionKey,
  parseCurrencyCode,
  formatDate
} from '@/lib/resultFormatters'
import { maturityFromScore } from '@/services/deepDiagnostic'
import styles from './PrintableReport.module.css'

interface PrintableReportProps {
  context: DiagnosticContext
  llmResult?: Record<string, any>
}

export default function PrintableReport({ context, llmResult }: PrintableReportProps) {
  const { scores, calculations, opportunities, risks, company } = context
  const currencyCode = parseCurrencyCode(context.currency)
  // Values below are already in the local display currency — format only,
  // never convert again (formatCurrency would re-multiply by the FX rate).
  const fmtCurrency = (v: number | null | undefined) => formatLocalAmount(v, currencyCode)
  
  const totalAnnualSavings = calculations.totalAnnualSavingsLocal ?? calculations.totalAnnualSavingsIDR ?? null
  const annualLaborSavings = calculations.annualLaborSavingsLocal ?? calculations.annualLaborSavingsIDR ?? null
  const annualProcessSavings = calculations.annualProcessSavingsLocal ?? calculations.annualProcessSavingsIDR ?? null
  const costOfInaction90Days = calculations.costOfInaction90DaysLocal ?? calculations.costOfInaction90DaysIDR ?? null

  const _llmScore =
    typeof llmResult?.score === 'number' ? llmResult.score
    : typeof llmResult?.ai_readiness_score === 'number' ? llmResult.ai_readiness_score
    : null
  const _composite = _llmScore != null ? Math.round(scores.composite * 0.7 + _llmScore * 0.3) : scores.composite
  const _maturity = _llmScore != null ? maturityFromScore(_composite) : scores.maturityLevel

  const highRiskCount = risks.filter(r => r.severity === 'HIGH').length
  const quickWinCount = opportunities.filter(o => o.quadrant === 'quick_win').length

  const assessmentBullets = [
    { icon: '▲', text: `${company} scores ${_composite}/100, placing it at ${_maturity} maturity.` },
    { icon: '▲', text: `Strongest dimension: ${humanizeDimensionKey(scores.strongestDimension)}.` },
    { icon: '▽', text: `Greatest gap: ${humanizeDimensionKey(scores.weakestDimension)}.` },
    { icon: '▽', text: `${highRiskCount} high-severity risk${highRiskCount !== 1 ? 's' : ''} identified.` },
    { icon: '▶', text: `${quickWinCount} quick-win opportunit${quickWinCount !== 1 ? 'ies' : 'y'} available.` },
  ]

  return (
    <div className={styles.printContainer}>
      <div className={styles.header}>
        <h1 className={styles.title}>Business Operations Assessment</h1>
        <p className={styles.subtitle}>{company} • {formatDate(context.submittedAt)}</p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Operational Health</h2>
        <div className={styles.scorecardRow}>
          <ScoreRing score={_composite} maturityLevel={_maturity} isPrintMode={true} />
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
        <h2 className={styles.sectionTitle}>Business Operations Analysis</h2>
        {llmResult ? (
          <>
            {(llmResult.narrative_summary || llmResult.narrative) && (
              <p style={{ fontSize: '12px', lineHeight: 1.6, color: '#1f2937', margin: '0 0 10px' }}>
                {llmResult.narrative_summary || llmResult.narrative}
              </p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
              {Array.isArray(llmResult.strengths) && llmResult.strengths.length > 0 && (
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', margin: '0 0 4px' }}>Strengths</div>
                  <ul style={{ margin: 0, paddingLeft: '14px', fontSize: '11px', color: '#1f2937' }}>
                    {llmResult.strengths.slice(0, 5).map((s: string, i: number) => (<li key={i}>{s}</li>))}
                  </ul>
                </div>
              )}
              {Array.isArray(llmResult.primary_constraints ?? llmResult.blockers) && (llmResult.primary_constraints ?? llmResult.blockers).length > 0 && (
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', margin: '0 0 4px' }}>Primary constraints</div>
                  <ul style={{ margin: 0, paddingLeft: '14px', fontSize: '11px', color: '#1f2937' }}>
                    {(llmResult.primary_constraints ?? llmResult.blockers).slice(0, 5).map((s: string, i: number) => (<li key={i}>{s}</li>))}
                  </ul>
                </div>
              )}
            </div>
            {llmResult.recommended_next_step && (
              <p style={{ fontSize: '11px', color: '#1f2937', borderLeft: '3px solid #4a5c39', paddingLeft: '8px', margin: '10px 0 0' }}>
                <strong>Recommended next step:</strong> {llmResult.recommended_next_step}
              </p>
            )}
          </>
        ) : (
          <p style={{ fontSize: '11px', color: '#6b7280', margin: 0 }}>
            Business operations analysis was unavailable for this submission. Scores and projections are computed deterministically from your answers.
          </p>
        )}
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

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Financial Case</h2>
        <div className={styles.grid}>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>Business Value Created</div>
            <div className={styles.tileValue} style={totalAnnualSavings && totalAnnualSavings < 0 ? { color: '#dc2626' } : undefined}>{fmtCurrency(totalAnnualSavings)}</div>
          </div>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>Recovered Labor Value</div>
            <div className={styles.tileValue} style={annualLaborSavings && annualLaborSavings < 0 ? { color: '#dc2626' } : undefined}>{fmtCurrency(annualLaborSavings)}</div>
          </div>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>Process Efficiency Value</div>
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
            <div className={styles.tileLabel}>3-Year NPV (10% discount)</div>
            <div className={styles.tileValue}>{fmtCurrency(((calculations as any).npv3YearLocal) ?? null)}</div>
          </div>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>Operational Cost of Delay (90 Days)</div>
            <div className={styles.tileValue} style={costOfInaction90Days && costOfInaction90Days < 0 ? { color: '#dc2626' } : undefined}>{fmtCurrency(costOfInaction90Days)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
