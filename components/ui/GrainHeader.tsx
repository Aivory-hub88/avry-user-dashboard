'use client'

/**
 * The grainy-gradient header used on the report-style pages (Diagnostic result and Blueprint in teal; Agents and Roadmap in sunset).
 * It is the pricing cards' "tri" scene (one dominant field, one large soft shape, a small glow in the far
 * corner, mixed in Oklab) with the Fibonacci circles on the right edge, from the Aivory gradient system.
 * Type on it is white; primary actions are solid white with dark-blue text; secondary ones are frosted.
 */
import type { CSSProperties, ReactNode } from 'react'
import { BokehGradient, type BokehScene, type LeafFigure } from '@/components/ui/BokehGradient'

/**
 * A smooth ramp, not a set of blobs: six colours ordered from dark to light whose neighbours are close in
 * lightness, so the hues drift into one another through luminous in-betweens, with no dark seam and a soft
 * shadow. This is what makes ElevenLabs' gradients read as one blended wash; the old `tri` scene put a dark seam
 * and hard-edged shapes between the hues and looked coarse.
 */
const ramp = (colors: readonly [string, string, string, string, string, string], seed: number, scale: number, exposure: number): BokehScene => ({
  colors: [...colors] as BokehScene['colors'],
  mode: 'field',
  scale,
  seed,
  light: 0.1,
  shadow: 0.1,
  exposure,
})

export type GrainWorld = 'teal' | 'sunset' | 'lagoon' | 'harbour' | 'aubergine'

export const GRAIN_HEADER_WORLDS: Record<GrainWorld, BokehScene> = {
  /** Diagnostic result and Blueprint: deep teal into sea green, a touch of amber. */
  teal: ramp(['#06252d', '#0a3a46', '#12566a', '#217a86', '#3b9a98', '#d6a15c'], 6.2, 0.3, 0.9),
  /** Agents and Roadmap: blue into violet, magenta and coral. */
  sunset: ramp(['#0e1f5c', '#22388e', '#5a3fa4', '#9e4a98', '#d0626e', '#ee9560'], 3.3, 0.3, 0.88),
  /** For other pages: teal into copper and coral. */
  lagoon: ramp(['#06303a', '#0f5360', '#2a8088', '#b9885a', '#e0705f', '#f09a6a'], 4.1, 0.3, 0.84),
  /** For other pages: navy into blue, teal, emerald and olive gold. */
  harbour: ramp(['#0b1a4c', '#173f8e', '#1f7f94', '#2f9e7a', '#7fb06a', '#d2b45a'], 3.2, 0.3, 0.84),
  /** For other pages: plum into orchid, rose and coral. */
  aubergine: ramp(['#22103a', '#4a2a78', '#8a4690', '#c25a82', '#e57a6a', '#f0a070'], 1.9, 0.3, 0.84),
}

const FIGURE: LeafFigure = { kind: 'fibonacci', origin: [1.02, 0.5] }

/** Text colour on the gradient (white hierarchy) and the dark blue used on solid white buttons. */
export const ON_GRAIN_INK = '#06232b'

export default function GrainHeader({
  world = 'teal',
  className = '',
  style,
  children,
}: {
  world?: GrainWorld
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <BokehGradient scene={GRAIN_HEADER_WORLDS[world]} figure={FIGURE} className={`text-white ${className}`} style={style}>
      {children}
    </BokehGradient>
  )
}
