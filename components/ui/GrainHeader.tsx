'use client'

/**
 * The grainy-gradient header used on the report-style pages (Diagnostic result, Blueprint, Roadmap in teal; Agents in sunset).
 * It is the pricing cards' "tri" scene (one dominant field, one large soft shape, a small glow in the far
 * corner, mixed in Oklab) with the Fibonacci circles on the right edge, from the Aivory gradient system.
 * Type on it is white; primary actions are solid white with dark-blue text; secondary ones are frosted.
 */
import type { CSSProperties, ReactNode } from 'react'
import { BokehGradient, type BokehScene, type LeafFigure } from '@/components/ui/BokehGradient'

/**
 * colours: seam, dominant (60), secondary (30), accent (10), sheen. Big shapes (low scale) and a soft shadow
 * keep the three hues blended into one another instead of reading as separate blobs.
 */
const blended = (c: readonly [string, string, string, string, string], seed: number): BokehScene => ({
  colors: [c[0], c[1], c[2], c[3], c[4], c[4]],
  mode: 'tri',
  scale: 0.35,
  seed,
  light: 0.2,
  shadow: 0.15,
})

/** Deep teal, sea green and an amber glow: the report-style pages' header. */
const TEAL_SEA_AMBER = ['#0a2a33', '#0f4652', '#3a8a94', '#e8b266', '#e2f0ec'] as const
/** Deep blue, magenta and orange: three clearly different hues, for a surface that must read apart from the teal. */
const BLUE_MAGENTA_ORANGE = ['#0d1838', '#1c3f8c', '#a04fb4', '#f0803a', '#f6d3c0'] as const

export type GrainWorld = 'teal' | 'sunset'

export const GRAIN_HEADER_WORLDS: Record<GrainWorld, BokehScene> = {
  teal: blended(TEAL_SEA_AMBER, 5.3),
  sunset: blended(BLUE_MAGENTA_ORANGE, 3.3),
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
