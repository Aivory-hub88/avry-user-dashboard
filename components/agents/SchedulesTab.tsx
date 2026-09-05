"use client"
/**
 * The Schedules tab of Customize Agent — where a customer sets up a
 * recurring, unattended agent turn. ADR-009 Phase 3.
 *
 * Its own file rather than another branch inside CustomizeAgentModal (which
 * is already ~1,800 lines): the modal mounts it with one line and owns none
 * of its state. Every visual idiom here — `inputClass`, the rounded-xl row
 * cards, the accent-tinted primary button, the amber/red status pills — is
 * copied from the MCP tab next door on purpose, so the two read as the same
 * surface rather than two designers' work.
 *
 * **Nobody is asked to write cron.** The form offers four shapes (daily,
 * weekdays, weekly, monthly) and a time, and `buildCronExpression` turns
 * that into the expression. That is a safety property, not just a courtesy:
 * every shape writes a literal minute, so the UI has no way to express the
 * every-minute schedule the backend's runaway-frequency floor exists to
 * refuse. An expression that came from somewhere else and doesn't parse
 * back into a shape is shown verbatim and left alone, never approximated
 * into the nearest shape and silently rewritten on the next save.
 *
 * **Status is shown as the backend reports it, never derived from
 * `enabled`.** A schedule the tenant has switched on still reads "Waiting
 * for the agent" until Cerveau's reconcile has actually created the job and
 * acknowledged it. Claiming "Running" a minute early is precisely the
 * failure ADR-009 §6 is about — a schedule that looks live and never fires.
 *
 * Every text node is a <span>/<div>/<label>, never <p> or <h1-6>: this app
 * has a global `main p` / `main h1-h4` prose style that silently overrides
 * Tailwind's font-size, colour and margin on those tags regardless of the
 * class on the element.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getCredits, type CreditStatus } from '@/lib/agentProfiles'
import {
  DEFAULT_SHAPE,
  buildCronExpression,
  createScheduledRun,
  deleteScheduledRun,
  detectTimeZone,
  listScheduledRuns,
  parseCronExpression,
  supportedTimeZones,
  updateScheduledRun,
  type Cadence,
  type ScheduleQuota,
  type ScheduleShape,
  type ScheduledRun,
} from '@/lib/tenantScheduledRuns'

const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 text-white/90 text-[13px] placeholder-white/25 focus:outline-none focus:border-accent/40 transition-colors'

const CADENCES: Cadence[] = ['daily', 'weekdays', 'weekly', 'monthly']
const MAX_PROMPT = 2000
const MAX_NAME = 60

/** Two digits, always — `9:0` is not a time. */
function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function timeValue(shape: ScheduleShape): string {
  return `${pad(shape.hour)}:${pad(shape.minute)}`
}

interface SchedulesTabProps {
  agentType: string
}

export default function SchedulesTab({ agentType }: SchedulesTabProps) {
  const t = useTranslations('customizeAgent')

  const [runs, setRuns] = useState<ScheduledRun[]>([])
  const [quota, setQuota] = useState<ScheduleQuota | null>(null)
  const [credits, setCredits] = useState<CreditStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  /** The row being edited, or `null` when the form is creating a new one. */
  const [editing, setEditing] = useState<ScheduledRun | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [shape, setShape] = useState<ScheduleShape>(DEFAULT_SHAPE)
  const [timezone, setTimezone] = useState(detectTimeZone)

  const zones = useMemo(() => supportedTimeZones(), [])
  const weekdayNames = useMemo(
    () => [
      t('scheduleSunday'),
      t('scheduleMonday'),
      t('scheduleTuesday'),
      t('scheduleWednesday'),
      t('scheduleThursday'),
      t('scheduleFriday'),
      t('scheduleSaturday'),
    ],
    [t],
  )

  // Mounted with `key={agentType}`, so a different agent gets a fresh
  // component rather than this one re-fetching — which is why `loading`
  // starts true and is only ever set false, and why nothing here sets state
  // synchronously during the effect.
  useEffect(() => {
    let cancelled = false
    listScheduledRuns(agentType)
      .then((page) => {
        if (cancelled) return
        setRuns(page.runs)
        setQuota(page.quota)
      })
      .catch((e: unknown) => {
        if (!cancelled) setListError(e instanceof Error ? e.message : t('scheduleListFailed'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [agentType, t])

  // Intelligence Credits are what a scheduled run actually spends, so the
  // allowance and the balance belong on the same line — a tenant deciding
  // whether to add a schedule is really deciding whether to spend. Failures
  // are swallowed: `getCredits` already returns `null` on a non-OK response,
  // and a credits outage must not stop someone managing their schedules.
  useEffect(() => {
    let cancelled = false
    getCredits()
      .then((status) => {
        if (!cancelled) setCredits(status)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  /** Plain-language cadence, built from the shape the expression parses back
   *  into. An expression this builder could not have written is shown as
   *  itself rather than mislabelled. */
  const describe = useCallback(
    (run: ScheduledRun): string => {
      const parsed = parseCronExpression(run.cron_expression)
      if (!parsed) return run.cron_expression
      const time = timeValue(parsed)
      switch (parsed.cadence) {
        case 'weekdays':
          return t('cadenceWeekdaysAt', { time })
        case 'weekly':
          return t('cadenceWeeklyAt', { day: weekdayNames[parsed.weekday], time })
        case 'monthly':
          return t('cadenceMonthlyAt', { day: parsed.dayOfMonth, time })
        case 'daily':
        default:
          return t('cadenceDailyAt', { time })
      }
    },
    [t, weekdayNames],
  )

  const openCreate = () => {
    setEditing(null)
    setName('')
    setPrompt('')
    setShape(DEFAULT_SHAPE)
    setTimezone(detectTimeZone())
    setFormError(null)
    setFormOpen(true)
  }

  const openEdit = (run: ScheduledRun) => {
    setEditing(run)
    setName(run.name)
    setPrompt(run.prompt)
    setShape(parseCronExpression(run.cron_expression) ?? DEFAULT_SHAPE)
    setTimezone(run.timezone)
    setFormError(null)
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
    setFormError(null)
  }

  const handleSubmit = async () => {
    const trimmedName = name.trim()
    const trimmedPrompt = prompt.trim()
    if (!trimmedName || !trimmedPrompt) {
      setFormError(t('scheduleNamePromptRequired'))
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      const cron = buildCronExpression(shape)
      if (editing) {
        // Send the whole shape, not a diff. The backend treats any content
        // change as "Cerveau no longer owns the current job" and returns the
        // row to pending_activation — sending fields that happen to be
        // unchanged costs nothing and keeps this call one obvious thing.
        const updated = await updateScheduledRun(editing.id, {
          name: trimmedName,
          prompt: trimmedPrompt,
          cron_expression: cron,
          timezone,
        })
        setRuns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      } else {
        const created = await createScheduledRun({
          agent_type: agentType,
          name: trimmedName,
          prompt: trimmedPrompt,
          cron_expression: cron,
          timezone,
        })
        setRuns((prev) => [created, ...prev])
      }
      closeForm()
    } catch (e) {
      // The backend writes these for the reader — the quota refusal names
      // the plan and its allowance, the timezone refusal explains why one is
      // required. Substituting a generic string here would throw that away.
      setFormError(e instanceof Error ? e.message : t('scheduleSaveFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggle = async (run: ScheduledRun) => {
    setBusyId(run.id)
    setListError(null)
    try {
      const updated = await updateScheduledRun(run.id, { enabled: !run.enabled })
      setRuns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
    } catch (e) {
      setListError(e instanceof Error ? e.message : t('scheduleToggleFailed'))
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (run: ScheduledRun) => {
    if (!window.confirm(t('scheduleRemoveConfirm', { name: run.name }))) return
    setBusyId(run.id)
    setListError(null)
    try {
      await deleteScheduledRun(run.id)
      setRuns((prev) => prev.filter((r) => r.id !== run.id))
      if (editing?.id === run.id) closeForm()
    } catch (e) {
      setListError(e instanceof Error ? e.message : t('scheduleRemoveFailed'))
    } finally {
      setBusyId(null)
    }
  }

  // Unknown quota (an older backend that predates the field) is not the
  // same as a full one: without a number, offer the form and let the
  // backend be the authority, rather than blocking on a guess.
  const atQuota = quota !== null && runs.length >= quota.perAgentLimit
  // Superadmins are unlimited; a balance line for them is noise.
  const showCredits = credits !== null && !credits.unlimited && credits.allowance !== null
  const lowCredits =
    showCredits && credits.allowance ? (credits.balance ?? 0) / credits.allowance < 0.15 : false

  if (loading) {
    return <div className="py-10 text-center text-white/40 text-[13px]">{t('loadingSchedules')}</div>
  }

  return (
    <div className="space-y-4">
      <div className="px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-white/45 text-[11.5px] leading-relaxed">
        {t('scheduleBillingNote')}
      </div>

      {/* The allowance and what a run actually spends, on one line. Both are
          reported by the backend — no copy of either ladder lives here, so
          neither can quietly promise something the API no longer grants.
          A superadmin's credits are unlimited and the number would be
          noise, so that half is omitted rather than shown as "∞". */}
      {(quota || showCredits) && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-0.5 text-[11.5px]">
          {quota && (
            <span className={atQuota ? 'text-amber-warn/90' : 'text-white/40'}>
              {quota.perAgentLimit === 0
                ? t('scheduleQuotaNone', { plan: quota.tierLabel })
                : t('scheduleQuotaUsed', { used: runs.length, limit: quota.perAgentLimit })}
            </span>
          )}
          {showCredits && (
            <span className={lowCredits ? 'text-amber-warn/90' : 'text-white/40'}>
              {t('scheduleCreditsLeft', {
                balance: credits!.balance ?? 0,
                allowance: credits!.allowance ?? 0,
              })}
            </span>
          )}
        </div>
      )}

      {listError && (
        <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300/90 text-[12px]">
          {listError}
        </div>
      )}

      {runs.length > 0 && (
        <div className="space-y-2">
          {runs.map((run) => (
            <ScheduleRow
              key={run.id}
              run={run}
              cadence={describe(run)}
              busy={busyId === run.id}
              onToggle={() => handleToggle(run)}
              onEdit={() => openEdit(run)}
              onDelete={() => handleDelete(run)}
            />
          ))}
        </div>
      )}

      {/* At the limit the form is not offered at all. The backend would
          refuse the save with a good message, but only after someone had
          written the whole thing — saying so up front, next to the way to
          free a slot, is the same information delivered before the work
          rather than after it. */}
      {!formOpen &&
        (atQuota ? (
          <div className="px-4 py-2.5 rounded-xl bg-amber-warn/[0.08] border border-amber-warn/20 text-amber-warn/90 text-[11.5px] leading-relaxed">
            {quota!.perAgentLimit === 0
              ? t('scheduleQuotaNoneHint', { plan: quota!.tierLabel })
              : t('scheduleQuotaFullHint', { limit: quota!.perAgentLimit, plan: quota!.tierLabel })}
          </div>
        ) : (
          <button
            type="button"
            onClick={openCreate}
            className="w-full py-2.5 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/10 text-white/70 hover:text-white/90 text-[13px] font-medium transition-colors duration-150 ease-out active:scale-[0.99]"
          >
            {t('scheduleAdd')}
          </button>
        ))}

      {formOpen && (
        <div className="space-y-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          {formError && (
            <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300/90 text-[12px]">
              {formError}
            </div>
          )}

          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="text-white/70 text-[12px] font-medium" htmlFor="schedule-name">
                {t('scheduleNameLabel')}
              </label>
              <span className={`text-[10px] ${name.length > MAX_NAME * 0.9 ? 'text-amber-warn/80' : 'text-white/25'}`}>
                {name.length}/{MAX_NAME}
              </span>
            </div>
            <input
              id="schedule-name"
              className={inputClass}
              value={name}
              maxLength={MAX_NAME}
              // Matches the backend's own ^[a-zA-Z0-9 _-]{1,60}$ so a name is
              // never accepted here and refused there.
              onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9 _-]/g, ''))}
              placeholder={t('scheduleNamePlaceholder')}
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="text-white/70 text-[12px] font-medium" htmlFor="schedule-prompt">
                {t('schedulePromptLabel')}
              </label>
              <span className={`text-[10px] ${prompt.length > MAX_PROMPT * 0.9 ? 'text-amber-warn/80' : 'text-white/25'}`}>
                {prompt.length}/{MAX_PROMPT}
              </span>
            </div>
            <div className="text-white/35 text-[11px] mb-1.5 -mt-0.5">{t('schedulePromptHint')}</div>
            <textarea
              id="schedule-prompt"
              className={`${inputClass} resize-none leading-relaxed`}
              rows={4}
              value={prompt}
              maxLength={MAX_PROMPT}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('schedulePromptPlaceholder')}
            />
          </div>

          <div>
            <label className="text-white/70 text-[12px] font-medium mb-1.5 block">{t('scheduleCadenceLabel')}</label>
            <div className="flex flex-wrap gap-2">
              {CADENCES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setShape((s) => ({ ...s, cadence: option }))}
                  className={`px-3.5 py-2 rounded-lg border text-[12.5px] transition-colors duration-150 ease-out active:scale-[0.98] ${
                    shape.cadence === option
                      ? 'bg-accent/15 border-accent/30 text-[#dbe5d3]'
                      : 'bg-white/[0.04] border-white/10 text-white/50 hover:text-white/75'
                  }`}
                >
                  {t(
                    option === 'daily'
                      ? 'cadenceDaily'
                      : option === 'weekdays'
                        ? 'cadenceWeekdays'
                        : option === 'weekly'
                          ? 'cadenceWeekly'
                          : 'cadenceMonthly',
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-white/70 text-[12px] font-medium mb-1.5 block" htmlFor="schedule-time">
                {t('scheduleTimeLabel')}
              </label>
              <input
                id="schedule-time"
                type="time"
                className={`${inputClass} [color-scheme:dark]`}
                value={timeValue(shape)}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(':')
                  setShape((s) => ({ ...s, hour: Number(h) || 0, minute: Number(m) || 0 }))
                }}
              />
            </div>

            {shape.cadence === 'weekly' && (
              <div>
                <label className="text-white/70 text-[12px] font-medium mb-1.5 block" htmlFor="schedule-weekday">
                  {t('scheduleWeekdayLabel')}
                </label>
                <select
                  id="schedule-weekday"
                  className={`${inputClass} cursor-pointer`}
                  value={shape.weekday}
                  onChange={(e) => setShape((s) => ({ ...s, weekday: Number(e.target.value) }))}
                >
                  {weekdayNames.map((label, index) => (
                    <option key={label} value={index} className="bg-[#2e2e2e]">
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {shape.cadence === 'monthly' && (
              <div>
                <label className="text-white/70 text-[12px] font-medium mb-1.5 block" htmlFor="schedule-dom">
                  {t('scheduleDayOfMonthLabel')}
                </label>
                <select
                  id="schedule-dom"
                  className={`${inputClass} cursor-pointer`}
                  value={shape.dayOfMonth}
                  onChange={(e) => setShape((s) => ({ ...s, dayOfMonth: Number(e.target.value) }))}
                >
                  {/* 1–28 only: a run set for the 31st would skip most months,
                      and a schedule that quietly does not happen is worse
                      than one that never offered the date. */}
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d} className="bg-[#2e2e2e]">
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="text-white/70 text-[12px] font-medium mb-1.5 block" htmlFor="schedule-tz">
              {t('scheduleTimezoneLabel')}
            </label>
            <div className="text-white/35 text-[11px] mb-1.5 -mt-0.5">{t('scheduleTimezoneHint')}</div>
            <select
              id="schedule-tz"
              className={`${inputClass} cursor-pointer`}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {zones.map((zone) => (
                <option key={zone} value={zone} className="bg-[#2e2e2e]">
                  {zone}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-lg bg-accent/20 hover:bg-accent/30 text-[#dbe5d3] text-[13px] font-medium border border-accent/30 transition-colors duration-150 ease-out active:scale-[0.99] disabled:opacity-50 disabled:active:scale-100"
            >
              {submitting
                ? t('scheduleSaving')
                : editing
                  ? t('scheduleSaveChanges')
                  : t('scheduleCreate')}
            </button>
            <button
              type="button"
              onClick={closeForm}
              disabled={submitting}
              className="px-4 py-2.5 rounded-lg bg-white/[0.05] hover:bg-white/10 text-white/60 hover:text-white/85 text-[13px] transition-colors duration-150 ease-out disabled:opacity-40"
            >
              {t('scheduleCancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ScheduleRow({
  run,
  cadence,
  busy,
  onToggle,
  onEdit,
  onDelete,
}: {
  run: ScheduledRun
  cadence: string
  busy: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const t = useTranslations('customizeAgent')

  // Reported, not derived. `enabled` is what the tenant asked for; `status`
  // is whether Cerveau has actually taken the job on. The gap between them
  // is real and is exactly what a tenant needs to see.
  const pill =
    run.status === 'active'
      ? { label: t('scheduleStatusActive'), className: 'bg-accent/15 border-accent/25 text-[#dbe5d3]' }
      : run.status === 'failed'
        ? { label: t('scheduleStatusFailed'), className: 'bg-red-500/10 border-red-500/20 text-red-300/90' }
        : run.status === 'paused'
          ? { label: t('scheduleStatusPaused'), className: 'bg-white/[0.06] border-white/10 text-white/50' }
          : { label: t('scheduleStatusPending'), className: 'bg-amber-warn/15 border-amber-warn/25 text-amber-warn' }

  return (
    <div className="px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-white/80 text-[13px] font-medium truncate">{run.name}</div>
          <div className="text-white/35 text-[11px] truncate">
            {cadence} · {run.timezone}
          </div>
        </div>
        <span className={`shrink-0 px-2.5 py-1 rounded-full border text-[11px] font-medium ${pill.className}`}>
          {pill.label}
        </span>
      </div>

      {run.status === 'failed' && run.status_detail && (
        <div className="mt-2 text-red-300/70 text-[11.5px]">{run.status_detail}</div>
      )}

      <div className="mt-2 line-clamp-2 text-white/45 text-[11.5px] leading-[1.5]">{run.prompt}</div>

      <div className="mt-2.5 flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={onToggle}
          className="text-[#dbe5d3]/70 hover:text-[#dbe5d3] text-[11.5px] transition-colors duration-150 ease-out disabled:opacity-40"
        >
          {busy ? t('scheduleWorking') : run.enabled ? t('schedulePause') : t('scheduleResume')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onEdit}
          className="text-white/50 hover:text-white/80 text-[11.5px] transition-colors duration-150 ease-out disabled:opacity-40"
        >
          {t('scheduleEdit')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="text-red-300/60 hover:text-red-300/90 text-[11.5px] transition-colors duration-150 ease-out disabled:opacity-40"
        >
          {t('scheduleRemove')}
        </button>
      </div>
    </div>
  )
}
