'use client'

/**
 * Shared "thinking" loader — same 7-dot circular pulse used for the
 * landing page's AI demo (loader-wave), recolored near-white for the
 * dashboard's dark surfaces. One definition, sized per call site.
 */

const DOT_POSITIONS = [
  { top: '5%', left: '50%', delay: 0 },
  { top: '27.5%', left: '89%', delay: 150 },
  { top: '72.5%', left: '89%', delay: 300 },
  { top: '95%', left: '50%', delay: 450 },
  { top: '72.5%', left: '11%', delay: 600 },
  { top: '27.5%', left: '11%', delay: 750 },
  { top: '50%', left: '50%', delay: 900 },
] as const

export interface ThinkingDotsProps {
  /** Outer cluster size in px */
  size?: number
  /** Individual dot size in px */
  dotSize?: number
  className?: string
}

export function ThinkingDots({ size = 15, dotSize = 2, className }: ThinkingDotsProps) {
  return (
    <span
      className={`thinking-dots ${className ?? ''}`}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Thinking"
    >
      {DOT_POSITIONS.map((pos, i) => (
        <span
          key={i}
          className="thinking-dots__dot"
          style={{
            width: dotSize,
            height: dotSize,
            top: pos.top,
            left: pos.left,
            animationDelay: `${pos.delay}ms`,
          }}
        />
      ))}
    </span>
  )
}
