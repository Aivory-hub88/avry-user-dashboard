'use client'

import { useEffect, useRef, useState } from 'react'
import { copyToClipboard } from '@/lib/copyToClipboard'

type Status = 'idle' | 'copied' | 'failed'

/**
 * One-time secret (API key / download token) with a Copy button that only
 * says "Copied" when the clipboard write really succeeded.
 */
export default function CopySecretRow({
  value,
  copyLabel,
  copiedLabel,
  failedLabel,
}: {
  value: string
  copyLabel: string
  copiedLabel: string
  failedLabel: string
}) {
  const [status, setStatus] = useState<Status>('idle')
  const codeRef = useRef<HTMLElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const handleCopy = async () => {
    const ok = await copyToClipboard(value)
    if (!ok && codeRef.current) {
      // Pre-select the key so Cmd/Ctrl+C works straight away.
      const sel = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(codeRef.current)
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
    setStatus(ok ? 'copied' : 'failed')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setStatus('idle'), ok ? 2000 : 6000)
  }

  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/10">
        <code ref={codeRef} className="flex-1 text-[12px] text-[var(--color-accent-text)] break-all select-all">{value}</code>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 px-2.5 py-1 rounded-md bg-white/[0.06] hover:bg-white/10 text-white/70 text-[11px] transition-colors"
        >
          {status === 'copied' ? copiedLabel : copyLabel}
        </button>
      </div>
      {status === 'failed' && (
        <p role="alert" className="mt-1.5 text-[11px] text-red-300">{failedLabel}</p>
      )}
    </div>
  )
}
