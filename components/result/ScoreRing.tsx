'use client'

import { useState, useEffect } from 'react'
import styles from './ScoreRing.module.css'

interface ScoreRingProps {
  score: number
  maturityLevel: string
  isPrintMode?: boolean
}

const RADIUS = 80
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export default function ScoreRing({ score, maturityLevel, isPrintMode }: ScoreRingProps) {
  const [animated, setAnimated] = useState(false)

  useEffect(() => {
    // Trigger animation on mount
    const timer = setTimeout(() => setAnimated(true), 50)
    return () => clearTimeout(timer)
  }, [])

  const clampedScore = Math.max(0, Math.min(100, score))
  const arcLength = animated ? (clampedScore / 100) * CIRCUMFERENCE : 0
  const dashArray = `${arcLength} ${CIRCUMFERENCE}`

  return (
    <div className={styles.container}>
      <svg
        viewBox="0 0 200 200"
        width="200"
        height="200"
        className={styles.svg}
        aria-label={`Score: ${clampedScore} out of 100, ${maturityLevel} maturity`}
        role="img"
      >
        {!isPrintMode && (
          <defs>
            {/* Gradient sweep for the value arc — deeper forest edge to a
                brighter mint tip, giving the ring depth instead of a flat
                single-tone stroke. */}
            <linearGradient id="scoreArcGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#7fae6f" />
              <stop offset="55%" stopColor="#b7cba6" />
              <stop offset="100%" stopColor="#d9ecc9" />
            </linearGradient>
            {/* Soft glow behind the arc for a "high-tech instrument" feel */}
            <filter id="scoreArcGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        )}
        {/* Ambient radial glow behind the whole ring */}
        {!isPrintMode && <circle className={styles.halo} cx="100" cy="100" r={RADIUS + 6} />}
        {/* Tick marks at 0/25/50/75/100 — gauge/instrument-panel detail */}
        {!isPrintMode && [0, 25, 50, 75, 100].map((tick) => {
          const angle = (tick / 100) * 360 - 90
          const rad = (angle * Math.PI) / 180
          const inner = RADIUS - 22
          const outer = RADIUS - 13
          return (
            <line
              key={tick}
              className={styles.tick}
              x1={100 + inner * Math.cos(rad)}
              y1={100 + inner * Math.sin(rad)}
              x2={100 + outer * Math.cos(rad)}
              y2={100 + outer * Math.sin(rad)}
            />
          )
        })}
        {/* Track */}
        <circle
          className={styles.track}
          cx="100"
          cy="100"
          r={RADIUS}
          stroke={isPrintMode ? '#e0e0e0' : undefined}
        />
        {/* Value arc — starts at 12 o'clock */}
        <circle
          className={styles.arc}
          cx="100"
          cy="100"
          r={RADIUS}
          strokeDasharray={dashArray}
          transform="rotate(-90 100 100)"
          stroke={isPrintMode ? '#4a5c39' : 'url(#scoreArcGradient)'}
          filter={isPrintMode ? undefined : 'url(#scoreArcGlow)'}
        />
        {/* Bright leading tip dot — reinforces the "gauge needle" read */}
        {!isPrintMode && clampedScore > 0 && (() => {
          const tipAngle = (clampedScore / 100) * 360 - 90
          const tipRad = (tipAngle * Math.PI) / 180
          return (
            <circle
              className={styles.arcTip}
              cx={100 + RADIUS * Math.cos(tipRad)}
              cy={100 + RADIUS * Math.sin(tipRad)}
              r="5"
              style={{ opacity: animated ? 1 : 0 }}
            />
          )
        })()}
        {/* Center score */}
        <text className={styles.centerScore} x="100" y="92" fill={isPrintMode ? '#3d3d3d' : undefined}>
          {clampedScore}
        </text>
        {/* Maturity label */}
        <text className={styles.centerMaturity} x="100" y="118" fill={isPrintMode ? '#5c5c5c' : undefined}>
          {maturityLevel}
        </text>
      </svg>
    </div>
  )
}
