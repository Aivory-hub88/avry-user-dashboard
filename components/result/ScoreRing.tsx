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
          stroke={isPrintMode ? '#4a5c39' : undefined}
        />
        {/* Center score */}
        <text className={styles.centerScore} x="100" y="92" fill={isPrintMode ? '#3d3d3d' : undefined}>
          {clampedScore}
        </text>
        {/* Maturity label */}
        <text className={styles.centerMaturity} x="100" y="118" fill={isPrintMode ? '#888884' : undefined}>
          {maturityLevel}
        </text>
      </svg>
    </div>
  )
}
