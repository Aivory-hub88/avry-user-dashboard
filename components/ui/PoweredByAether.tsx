'use client'

/**
 * "Powered by Aivory Aether" line used under the headers of the Diagnostics hero, the report, the Blueprint
 * and the Roadmap. White mark for the grainy-gradient headers.
 */
import { asset } from '@/lib/asset'
import { useLocaleContext } from '@/hooks/useLocale'

export default function PoweredByAether({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  const { locale } = useLocaleContext()
  return (
    <div
      className={`flex items-center gap-2.5 text-white/75 ${className}`}
      style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, ...style }}
    >
      <span>{locale === 'id' ? 'Didukung oleh' : 'Powered by'}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset('/Aivory_Aether_white.svg')} alt="Aivory Aether" style={{ height: 12, width: 'auto', opacity: 0.95 }} />
    </div>
  )
}
