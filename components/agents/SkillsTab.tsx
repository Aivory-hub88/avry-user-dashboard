"use client"
/**
 * The Skills tab of Customize Agent — a read-only listing of what this
 * agent can already do. ADR-008 Phase 4.
 *
 * Its own file rather than another branch inside CustomizeAgentModal,
 * mirroring SchedulesTab.tsx's own reasoning for the same split — the
 * modal mounts it with one line and owns none of its state.
 *
 * There is nothing to create, edit, toggle, or delete here — every skill
 * came from how an operator configured this install, and this tab exists
 * so a tenant can see what their agent can do without asking. That is the
 * whole feature: fetch once, render a list, no mutation state at all.
 *
 * Every text node is a <span>/<div>, never <p> or <h1-6>: this app has a
 * global `main p` / `main h1-h4` prose style that silently overrides
 * Tailwind's font-size, colour and margin on those tags regardless of the
 * class on the element.
 */
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { listAgentSkills, type AgentSkill } from '@/lib/agentSkills'

interface SkillsTabProps {
  agentType: string
}

const ORIGIN_LABEL_KEY: Record<string, string> = {
  workspace: 'skillOriginWorkspace',
  'open-skills': 'skillOriginOpenSkills',
  plugin: 'skillOriginPlugin',
  bundle: 'skillOriginBundle',
}

export default function SkillsTab({ agentType }: SkillsTabProps) {
  const t = useTranslations('customizeAgent')
  const [skills, setSkills] = useState<AgentSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // No setLoading(true)/setError(null) here on purpose: `loading` starts
  // true (see useState above) and this component is remounted with
  // key={agentType} whenever the agent changes (CustomizeAgentModal.tsx),
  // so this effect runs exactly once per mount — resetting state it
  // already holds would just be an extra render before the fetch settles.
  useEffect(() => {
    let cancelled = false
    listAgentSkills(agentType)
      .then((rows) => {
        if (!cancelled) setSkills(rows)
      })
      .catch(() => {
        if (!cancelled) setError(t('skillsLoadFailed'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [agentType, t])

  if (loading) {
    return <div className="py-10 text-center text-white/40 text-[13px]">{t('skillsLoading')}</div>
  }

  if (error) {
    return (
      <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300/90 text-[12px]">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-white/45 text-[11.5px] leading-relaxed">
        {t('skillsIntro')}
      </div>

      {skills.length === 0 ? (
        <div className="py-10 text-center text-white/40 text-[13px]">{t('skillsEmpty')}</div>
      ) : (
        <div className="space-y-2">
          {skills.map((skill) => (
            <div
              key={skill.name}
              className="px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-white/80 text-[13px] font-medium truncate">{skill.name}</div>
                <span className="shrink-0 px-2.5 py-1 rounded-full border bg-white/[0.06] border-white/10 text-white/50 text-[11px] font-medium">
                  {t(ORIGIN_LABEL_KEY[skill.origin] ?? 'skillOriginOther')}
                </span>
              </div>
              {skill.description && (
                <div className="mt-1.5 text-white/45 text-[11.5px] leading-[1.5]">
                  {skill.description}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
