'use client'

import { useEffect, useRef } from 'react'

/**
 * Orbiting-dots "thinking" mark. Modelled on measurements of the Claude app's thinking
 * sprite (110 frames @ 30 fps on a 48px canvas), reproduced as a live 3D simulation:
 *
 *  - 3 dots on tilted circular orbits around a shared centre (so two often overlap and
 *    the mark reads as "two dots" at some frames, three at others)
 *  - orbit radius ≈ 0.354 of the canvas, dot radius ≈ 0.079 (0.056 far … 0.115 near)
 *  - depth from perspective: nearer dots are bigger and brighter, farther ones smaller and
 *    dimmer, and dots are painted back-to-front so near ones pass over far ones
 *  - one full loop every 110/30 s ≈ 3.67 s; the dots grow out from the centre over the first
 *    16 frames (≈ 0.53 s)
 */

const LOOP_S = 110 / 30
const INTRO_S = 16 / 30
const ORBIT = 0.354 // orbit radius / canvas
const DOT = 0.079 // base dot radius / canvas
const PERSPECTIVE = 0.22 // larger = stronger size change with depth

// Per-dot orbit: phase offset around the ring and the ring's tilt about the x axis.
const DOTS = [
  { phase: 0.0, tilt: 0.0 },
  { phase: 2.15, tilt: 0.95 },
  { phase: 4.1, tilt: -0.75 },
] as const

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3)
}

function draw(ctx: CanvasRenderingContext2D, size: number, t: number, color: string) {
  ctx.clearRect(0, 0, size, size)
  const grow = easeOutCubic(Math.min(1, t / INTRO_S))
  const spin = (t / LOOP_S) * Math.PI * 2

  const pts = DOTS.map((d) => {
    const a = d.phase + spin
    const x0 = Math.cos(a)
    const y0 = Math.sin(a)
    // Tilt the ring about the x axis: y shrinks, z carries the rest.
    const y = y0 * Math.cos(d.tilt)
    const z = y0 * Math.sin(d.tilt)
    const s = 1 / (1 - z * PERSPECTIVE)
    return { x: x0 * s, y: y * s, z, s }
  })

  // Far dots first, so near ones overlap them.
  pts.sort((p, q) => p.z - q.z)

  ctx.fillStyle = color
  for (const p of pts) {
    const depth = (p.z + 1) / 2 // 0 far … 1 near
    ctx.globalAlpha = (0.5 + 0.5 * depth) * (0.35 + 0.65 * grow)
    ctx.beginPath()
    ctx.arc(
      size / 2 + p.x * ORBIT * size * grow,
      size / 2 + p.y * ORBIT * size * grow,
      Math.max(0.5, DOT * size * p.s * (0.6 + 0.4 * grow)),
      0,
      Math.PI * 2,
    )
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

interface ThinkingOrbitProps {
  /** Canvas size in CSS px. */
  size?: number
  color?: string
  /** Hold a still frame instead of animating (prefers-reduced-motion). */
  still?: boolean
}

export function ThinkingOrbit({ size = 22, color = '#ffffff', still = false }: ThinkingOrbitProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (still) {
      draw(ctx, size, 1.2, color)
      return
    }
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      draw(ctx, size, (now - t0) / 1000, color)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [size, color, still])

  return <canvas ref={ref} aria-hidden style={{ width: size, height: size, display: 'block', flexShrink: 0 }} />
}
