'use client'

/**
 * The grainy-gradient header used on the report-style pages (Diagnostic result, Blueprint, Roadmap, Agents).
 * It is the pricing cards' "tri" scene (one dominant field, one large soft shape, a small glow in the far
 * corner, mixed in Oklab) with the Fibonacci circles on the right edge, from the Aivory gradient system.
 * Type on it is white; primary actions are solid white with dark-blue text; secondary ones are frosted.
 */
import type { CSSProperties, ReactNode } from 'react'
import { BokehGradient, type BokehScene, type LeafFigure } from '@/components/ui/BokehGradient'

/** colours: seam, dominant (60), secondary (30), accent (10), sheen. */
const tri = (seam: string, dominant: string, secondary: string, accent: string, sheen: string, seed: number): BokehScene => ({
  colors: [seam, dominant, secondary, accent, sheen, sheen],
  mode: 'tri',
  scale: 0.55,
  seed,
  light: 0.35,
  shadow: 0.55,
})

/** Aivory's own trio: deep blue field, a periwinkle-steel shape, a warm orange glow. */
const AIVORY_BLUE = ['#0a1838', '#1d4a9a', '#5a6fb0', '#e46a24', '#9aaedc'] as const
/** Indigo, orchid and peach: the second approved trio, for a surface that should read apart from the blue. */
const INDIGO_ORCHID_PEACH = ['#160f40', '#3a3aa8', '#b05ad0', '#f2a07a', '#f0d0f0'] as const

export type GrainWorld = 'blue' | 'indigo'

export const GRAIN_HEADER_WORLDS: Record<GrainWorld, BokehScene> = {
  blue: tri(...AIVORY_BLUE, 1.3),
  indigo: tri(...INDIGO_ORCHID_PEACH, 2.7),
}

const FIGURE: LeafFigure = { kind: 'fibonacci', origin: [1.02, 0.5] }

/** Text colour on the gradient (white hierarchy) and the dark blue used on solid white buttons. */
export const ON_GRAIN_INK = '#0a1838'

export default function GrainHeader({
  world = 'blue',
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
