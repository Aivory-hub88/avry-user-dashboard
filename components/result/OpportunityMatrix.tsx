import type { RankedOpportunity } from '@/types/diagnostic'
import styles from './OpportunityMatrix.module.css'

interface OpportunityMatrixProps {
  opportunities: RankedOpportunity[]
  highlightedId: string | null
  onDotClick: (id: string) => void
}

// Plot region bounds — sized to fit comfortably inside a card
const PLOT_LEFT = 50
const PLOT_RIGHT = 310
const PLOT_TOP = 20
const PLOT_BOTTOM = 290
const PLOT_WIDTH = PLOT_RIGHT - PLOT_LEFT   // 260
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP  // 270

// Midpoint dividers (effort=5.5, impact=5.5)
const MID_X = PLOT_LEFT + ((5.5 - 1) / 9) * PLOT_WIDTH
const MID_Y = PLOT_TOP + ((10 - 5.5) / 9) * PLOT_HEIGHT

// Distinct colors per opportunity index — enough for up to 8 opportunities
const DOT_COLORS = [
  '#00e59e', // teal-green
  '#60a5fa', // blue
  '#f59e0b', // amber
  '#f472b6', // pink
  '#a78bfa', // violet
  '#34d399', // emerald
  '#fb923c', // orange
  '#e879f9', // fuchsia
]

function dotX(effortScore: number): number {
  return PLOT_LEFT + ((effortScore - 1) / 9) * PLOT_WIDTH
}

function dotY(impactScore: number): number {
  // Inverted Y: high impact at top
  return PLOT_TOP + ((10 - impactScore) / 9) * PLOT_HEIGHT
}

// Known limitation: if opportunities array exceeds ~15 items, dots may overlap
// in the plot area. No fix needed now — document as code comment.

export default function OpportunityMatrix({ opportunities, highlightedId, onDotClick }: OpportunityMatrixProps) {
  return (
    <div className={styles.container}>
      <svg
        viewBox="0 0 340 320"
        width="320"
        height="300"
        className={styles.svg}
        aria-label="Opportunity priority matrix"
        role="img"
      >
        {/* Axes */}
        <line x1={PLOT_LEFT} y1={PLOT_BOTTOM} x2={PLOT_RIGHT} y2={PLOT_BOTTOM} stroke="#ffffff" strokeWidth="0.5" />
        <line x1={PLOT_LEFT} y1={PLOT_TOP} x2={PLOT_LEFT} y2={PLOT_BOTTOM} stroke="#ffffff" strokeWidth="0.5" />

        {/* Axis labels */}
        <text className={styles.axisLabel} x={(PLOT_LEFT + PLOT_RIGHT) / 2} y={310}>
          Effort →
        </text>
        <text
          className={styles.axisLabelY}
          x={12}
          y={(PLOT_TOP + PLOT_BOTTOM) / 2}
          transform={`rotate(-90, 12, ${(PLOT_TOP + PLOT_BOTTOM) / 2})`}
        >
          Impact ↑
        </text>

        {/* Quadrant dividers */}
        <line className={styles.divider} x1={MID_X} y1={PLOT_TOP} x2={MID_X} y2={PLOT_BOTTOM} />
        <line className={styles.divider} x1={PLOT_LEFT} y1={MID_Y} x2={PLOT_RIGHT} y2={MID_Y} />

        {/* Quadrant labels */}
        <text className={styles.quadrantLabel} x={PLOT_LEFT + 6} y={PLOT_TOP + 14}>Quick Win</text>
        <text className={styles.quadrantLabel} x={MID_X + 6} y={PLOT_TOP + 14}>Major Project</text>
        <text className={styles.quadrantLabel} x={PLOT_LEFT + 6} y={MID_Y + 14}>Fill In</text>
        <text className={styles.quadrantLabel} x={MID_X + 6} y={MID_Y + 14}>Thankless Task</text>

        {/* Dots — each opportunity gets a distinct color */}
        {opportunities.map((opp, idx) => {
          const isHighlighted = opp.id === highlightedId
          const cx = dotX(opp.effort)
          const cy = dotY(opp.impact)
          const color = DOT_COLORS[idx % DOT_COLORS.length]
          return (
            <circle
              key={opp.id}
              className={styles.dot}
              role="button"
              aria-label={opp.title}
              aria-pressed={isHighlighted}
              tabIndex={0}
              onClick={() => onDotClick(opp.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onDotClick(opp.id)
                }
              }}
              cx={cx}
              cy={cy}
              r={isHighlighted ? 10 : 8}
              fill={color}
              stroke={isHighlighted ? '#fff' : '#262623'}
              strokeWidth={isHighlighted ? 2 : 1.5}
              opacity={isHighlighted ? 1 : 0.85}
              style={{ cursor: 'pointer' }}
            />
          )
        })}
      </svg>

      {/* Color legend */}
      <div className={styles.legend}>
        {opportunities.map((opp, idx) => (
          <div key={opp.id} className={styles.legendItem}>
            <span
              className={styles.legendDot}
              style={{ background: DOT_COLORS[idx % DOT_COLORS.length] }}
            />
            <span className={styles.legendLabel}>{opp.title}</span>
          </div>
        ))}
      </div>
    </div>
  )
}