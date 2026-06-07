import type { DimensionKey, DimensionScores } from '@/types/diagnostic'
import { humanizeDimensionKey } from '@/lib/resultFormatters'
import styles from './RadarChart.module.css'

interface RadarChartProps {
  scores: Pick<DimensionScores, 'strategy' | 'data' | 'process' | 'people' | 'governance'>
}

const CENTER_X = 150
const CENTER_Y = 150
const MAX_RADIUS = 120
const LABEL_OFFSET = 18

// Hardcoded axis order — 5 axes at 72° intervals starting from top (−90°)
const RADAR_AXES: { key: DimensionKey; angle: number }[] = [
  { key: 'strategy',   angle: -90  }, // top
  { key: 'data',       angle: -18  }, // upper-right
  { key: 'process',    angle: 54   }, // lower-right
  { key: 'people',     angle: 126  }, // lower-left
  { key: 'governance', angle: 198  }, // upper-left
]

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function vertex(score: number, angle: number): { x: number; y: number } {
  const r = (score / 100) * MAX_RADIUS
  return {
    x: CENTER_X + r * Math.cos(toRad(angle)),
    y: CENTER_Y + r * Math.sin(toRad(angle)),
  }
}

function guidePolygon(pct: number): string {
  return RADAR_AXES.map(({ angle }) => {
    const r = pct * MAX_RADIUS
    const x = CENTER_X + r * Math.cos(toRad(angle))
    const y = CENTER_Y + r * Math.sin(toRad(angle))
    return `${x},${y}`
  }).join(' ')
}

export default function RadarChart({ scores }: RadarChartProps) {
  const dataPoints = RADAR_AXES.map(({ key, angle }) => {
    const score = scores[key] ?? 0
    return vertex(score, angle)
  })

  const dataPolygon = dataPoints.map(p => `${p.x},${p.y}`).join(' ')

  return (
    <div className={styles.container}>
      <svg
        viewBox="0 0 300 300"
        width="260"
        height="260"
        className={styles.svg}
        aria-label="Radar chart showing dimension scores"
        role="img"
      >
        {/* Guide polygons at 25%, 50%, 75%, 100% */}
        {[0.25, 0.5, 0.75, 1.0].map(pct => (
          <polygon
            key={pct}
            className={styles.guide}
            points={guidePolygon(pct)}
          />
        ))}

        {/* Axis lines from center to 100% vertex */}
        {RADAR_AXES.map(({ key, angle }) => {
          const tip = vertex(100, angle)
          return (
            <line
              key={key}
              className={styles.axisLine}
              x1={CENTER_X}
              y1={CENTER_Y}
              x2={tip.x}
              y2={tip.y}
            />
          )
        })}

        {/* Data polygon */}
        <polygon
          className={styles.dataPolygon}
          points={dataPolygon}
        />

        {/* Axis labels */}
        {RADAR_AXES.map(({ key, angle }) => {
          const labelR = MAX_RADIUS + LABEL_OFFSET
          const lx = CENTER_X + labelR * Math.cos(toRad(angle))
          const ly = CENTER_Y + labelR * Math.sin(toRad(angle))
          return (
            <text key={key} className={styles.axisLabel} x={lx} y={ly}>
              {humanizeDimensionKey(key)}
            </text>
          )
        })}
      </svg>
    </div>
  )
}
