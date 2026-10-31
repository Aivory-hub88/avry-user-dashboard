'use client'

/**
 * Small progress ring for the chat input's toolbar: how much of the monthly
 * credit limit is used, at a glance. Clicking it opens the full
 * CreditUsageMeter above the composer. The status is re-fetched every time
 * the popover opens, so it reflects the turns just sent.
 *
 * The popover is portalled to <body> with fixed positioning: composers clip
 * their contents (`overflow-hidden` on the rounded card).
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useSettingsModal } from '@/contexts/SettingsModalContext'
import CreditUsageMeter, { monthlyUsage, TONE_COLOR, useCreditStatus } from './CreditUsageMeter'

const SIZE = 18
const STROKE = 2.5
const R = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * R

export default function CreditUsageRing() {
  const t = useTranslations('credits')
  const { openSettingsModal } = useSettingsModal()
  const [open, setOpen] = useState(false)
  const [opens, setOpens] = useState(0)
  const credits = useCreditStatus(opens)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<{ bottom: number; right: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const place = () => {
      const r = buttonRef.current?.getBoundingClientRect()
      if (r) setAnchor({ bottom: window.innerHeight - r.top + 12, right: Math.max(16, window.innerWidth - r.right) })
    }
    place()
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!buttonRef.current?.contains(target) && !popRef.current?.contains(target)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', place)
    }
  }, [open])

  if (!credits) return null
  const { pct, usedFraction, tone } = credits.unlimited
    ? { pct: 0, usedFraction: 0, tone: 'ok' as const }
    : monthlyUsage(credits)

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="console-icon-btn"
        aria-label={t('ringLabel', { pct })}
        title={t('ringLabel', { pct })}
        aria-expanded={open}
        onClick={() => {
          if (!open) setOpens((n) => n + 1)
          setOpen((v) => !v)
        }}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={STROKE} />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={TONE_COLOR[tone]}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - usedFraction)}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            style={{ transition: 'stroke-dashoffset 500ms ease' }}
          />
        </svg>
      </button>
      {open &&
        anchor &&
        createPortal(
          <div
            ref={popRef}
            className="fixed z-[100] w-[min(400px,calc(100vw-32px))] shadow-2xl shadow-black/40"
            style={{ bottom: anchor.bottom, right: anchor.right }}
          >
            <CreditUsageMeter
              credits={credits}
              onTopUp={() => {
                setOpen(false)
                openSettingsModal('usage')
              }}
            />
          </div>,
          document.body,
        )}
    </>
  )
}
