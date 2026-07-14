import type { DimensionKey, DimensionScores } from '@/types/diagnostic'
import { humanizeDimensionKey } from '@/lib/resultFormatters'
import styles from './RadarChart.module.css'

interface RadarChartProps {
  scores: Pick<DimensionScores, 'strategy' | 'data' | 'process' | 'people' | 'governance' | 'security'>
  isPrintMode?: boolean
}

const CENTER_X = 150
const CENTER_Y = 150
const MAX_RADIUS = 120
const LABEL_OFFSET = 18

// Hardcoded axis order — 5 axes at 72° intervals starting from top (−90°)
const RADAR_AXES: { key: DimensionKey; angle: number }[] = [
  { key: 'strategy',   angle: -90  }, // top
  { key: 'data',       angle: -30  },
  { key: 'process',    angle: 30   },
  { key: 'people',     angle: 90   }, // bottom
  { key: 'governance', angle: 150  },
  { key: 'security',   angle: 210  },
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

export default function RadarChart({ scores, isPrintMode }: RadarChartProps) {
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
        {!isPrintMode && (
          <defs>
            <radialGradient id="radarFillGradient" cx="50%" cy="50%" r="65%">
              <stop offset="0%" stopColor="#d9ecc9" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#7fae6f" stopOpacity="0.10" />
            </radialGradient>
            <filter id="radarGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        )}
        {/* Guide polygons at 25%, 50%, 75%, 100% */}
        {[0.25, 0.5, 0.75, 1.0].map(pct => (
          <polygon
            key={pct}
            className={styles.guide}
            points={guidePolygon(pct)}
            stroke={isPrintMode ? '#e0e0e0' : undefined}
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
              stroke={isPrintMode ? '#e0e0e0' : undefined}
            />
          )
        })}

        {/* Data polygon */}
        <polygon
          className={styles.dataPolygon}
          points={dataPolygon}
          fill={isPrintMode ? 'rgba(74, 92, 57, 0.15)' : 'url(#radarFillGradient)'}
          stroke={isPrintMode ? '#4a5c39' : undefined}
          filter={isPrintMode ? undefined : 'url(#radarGlow)'}
        />
        {/* Vertex dots — reinforce each dimension's exact score point */}
        {!isPrintMode && dataPoints.map((p, i) => (
          <circle key={RADAR_AXES[i].key} className={styles.vertexDot} cx={p.x} cy={p.y} r="3.5" />
        ))}

        {/* Axis labels — anchor direction follows which side of the chart the
            axis points to, so long labels (e.g. "Security & Governance")
            extend outward away from center instead of crowding it. */}
        {RADAR_AXES.map(({ key, angle }) => {
          const labelR = MAX_RADIUS + LABEL_OFFSET
          const lx = CENTER_X + labelR * Math.cos(toRad(angle))
          const ly = CENTER_Y + labelR * Math.sin(toRad(angle))
          const cosA = Math.cos(toRad(angle))
          const anchor = cosA > 0.35 ? 'start' : cosA < -0.35 ? 'end' : 'middle'
          return (
            <text
              key={key}
              className={styles.axisLabel}
              x={lx}
              y={ly}
              textAnchor={anchor}
              fill={isPrintMode ? '#3d3d3d' : undefined}
            >
              {humanizeDimensionKey(key)}
            </text>
          )
        })}
      </svg>
    </div>
  )
}
