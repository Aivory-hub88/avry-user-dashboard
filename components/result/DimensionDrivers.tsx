'use client'

import { useState } from 'react'
import type { DimensionKey, ScoreDrivers } from '@/types/diagnostic'
import { humanizeDimensionKey } from '@/lib/resultFormatters'
import { DIM_CONSEQUENCE_CHAINS, formatConsequenceChain } from '@/lib/readinessNarrative'
import styles from './DimensionDrivers.module.css'

const DIMENSION_ORDER: DimensionKey[] = ['strategy', 'data', 'process', 'people', 'governance', 'security']

interface DimensionDriversProps {
  scoreDrivers: ScoreDrivers | null | undefined
}

/**
 * Phase E1.2/E2.2 — score traceability drill-down. Each dimension row
 * expands to show the 2-3 answers that most raised/lowered it, plus that
 * dimension's consequence chain from DIM_CONSEQUENCE_CHAINS (readinessNarrative.ts,
 * shared with the PDF's "Score drivers" sub-list).
 *
 * Renders nothing when scoreDrivers is missing — old stored contexts (built
 * before this feature shipped) fall back to exactly the pre-E1.2 layout,
 * no crash (brief §8 exit gate: graceful degradation).
 */
export default function DimensionDrivers({ scoreDrivers }: DimensionDriversProps) {
  const [openKey, setOpenKey] = useState<DimensionKey | null>(null)

  if (!scoreDrivers) return null

  return (
    <div className={styles.container}>
      <span className={styles.heading}>Score drivers — what moved each dimension</span>
      <div className={styles.rows}>
        {DIMENSION_ORDER.map((key) => {
          const drivers = scoreDrivers[key]
          if (!drivers || drivers.length === 0) return null
          const isOpen = openKey === key
          const chain = DIM_CONSEQUENCE_CHAINS[key]

          return (
            <div key={key} className={styles.row}>
              <button
                type="button"
                className={styles.rowHeader}
                onClick={() => setOpenKey(isOpen ? null : key)}
                aria-expanded={isOpen}
              >
                <span className={styles.rowLabel}>{humanizeDimensionKey(key)}</span>
                <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}>▾</span>
              </button>

              {isOpen && (
                <div className={styles.rowBody}>
                  <ul className={styles.driverList}>
                    {drivers.map((d, i) => (
                      <li key={i} className={styles.driverItem}>
                        <span
                          className={`${styles.driverIcon} ${d.direction === 'raised' ? styles.raised : styles.lowered}`}
                        >
                          {d.direction === 'raised' ? '↑' : '↓'}
                        </span>
                        <span className={styles.driverText}>{d.label}</span>
                      </li>
                    ))}
                  </ul>
                  {chain && (
                    <p className={styles.chainLine}>
                      <span className={styles.chainLabel}>If unaddressed: </span>
                      {formatConsequenceChain(chain)}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
