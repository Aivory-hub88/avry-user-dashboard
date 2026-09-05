/**
 * Tenant scheduled runs — recurring, unattended agent turns a customer sets
 * up themselves. See docs/ADR-009-CERVEAU-SCHEDULED-RUNS.md.
 *
 * Backend: avry-backend /api/v1/tenant-scheduled-runs (JWT). Mirrors
 * tenantMcpServers.ts's shape and conventions exactly.
 *
 * Two things about this surface are worth knowing before rendering it:
 *
 * 1. **`status` is not derived from `enabled`.** It is a real column saying
 *    whether *Cerveau* has picked the schedule up. A row starts at
 *    `pending_activation` and only becomes `active` once the runtime's
 *    reconcile has created the job and acknowledged it (ADR-009 §11). Any
 *    edit, and pausing, drop it back to `pending_activation`. Showing
 *    "Running" off `enabled` alone would claim a schedule is live before
 *    anything is scheduled to run — the exact failure this column exists to
 *    prevent.
 *
 * 2. **`timezone` is required and load-bearing.** Cerveau resolves a
 *    tz-less cron expression against the runtime host's own zone, which is
 *    meaningless to a customer and lands the run hours from where they
 *    asked. The backend rejects a missing or unknown zone outright; the UI
 *    should never make the user think about it, which is what
 *    `detectTimeZone()` is for.
 */

import { authedFetch } from './deployAuth'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'

/** Where a row is in the Cerveau handshake, not whether the tenant wants it on. */
export type ScheduledRunStatus = 'pending_activation' | 'active' | 'paused' | 'failed'

export interface ScheduledRun {
  id: string
  agent_type: string
  name: string
  prompt: string
  cron_expression: string
  timezone: string
  /** What the tenant asked for. Pair with `status` for what is actually true. */
  enabled: boolean
  status: ScheduledRunStatus
  /** Why, when `status` is `failed` — written for the tenant, not for logs. */
  status_detail: string | null
  last_synced_at: string | null
  created_at: string | null
  updated_at: string | null
}

export class ScheduledRunError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function parseErrorAndThrow(res: Response): Promise<never> {
  const body = await res.json().catch(() => null)
  const detail = body?.detail
  // The backend writes its 400s for the person reading them — the quota
  // refusal names the plan and the allowance, the cron refusal explains why
  // the shape was rejected. Passing the message straight through is more
  // useful than any generic string this layer could substitute.
  if (typeof detail === 'string') throw new ScheduledRunError(detail, res.status)
  // FastAPI's own validation errors arrive as a list of {loc, msg}.
  if (Array.isArray(detail) && detail[0]?.msg) {
    throw new ScheduledRunError(String(detail[0].msg), res.status)
  }
  throw new ScheduledRunError(`Request failed (${res.status})`, res.status)
}

/**
 * How many scheduled runs this plan allows, reported by the backend with
 * every list call.
 *
 * Deliberately not derived from a copy of the ladder here. A second copy
 * would drift the first time a plan's allowance changed, and it would drift
 * silently — the UI would keep promising an allowance the API no longer
 * grants, and the tenant would only find out by being refused.
 *
 * `perAgentLimit` is per (user, agent_type), not a total: a caller listing
 * every agent at once must not compare it against the whole list's length.
 * `0` means this plan has no scheduled runs at all — not an error, just
 * nothing allowed.
 */
export interface ScheduleQuota {
  perAgentLimit: number
  tier: string
  tierLabel: string
}

export interface ScheduledRunsPage {
  runs: ScheduledRun[]
  /** `null` on a Cerveau/backend that predates the field — the caller shows
   *  the list without a quota line rather than inventing a number. */
  quota: ScheduleQuota | null
}

export async function listScheduledRuns(agentType?: string): Promise<ScheduledRunsPage> {
  const query = agentType ? `?agent_type=${encodeURIComponent(agentType)}` : ''
  const res = await authedFetch(`${BACKEND_URL}/api/v1/tenant-scheduled-runs${query}`)
  if (!res.ok) await parseErrorAndThrow(res)
  const data = await res.json()
  const raw = data.quota
  return {
    runs: data.scheduled_runs ?? [],
    quota:
      raw && typeof raw.per_agent_limit === 'number'
        ? {
            perAgentLimit: raw.per_agent_limit,
            tier: String(raw.tier ?? ''),
            tierLabel: String(raw.tier_label ?? ''),
          }
        : null,
  }
}

export interface CreateScheduledRunInput {
  agent_type: string
  name: string
  prompt: string
  cron_expression: string
  timezone: string
}

export async function createScheduledRun(input: CreateScheduledRunInput): Promise<ScheduledRun> {
  const res = await authedFetch(`${BACKEND_URL}/api/v1/tenant-scheduled-runs`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!res.ok) await parseErrorAndThrow(res)
  const data = await res.json()
  return data.scheduled_run
}

/** Every field optional — this is both the pause/resume and the edit route. */
export interface UpdateScheduledRunInput {
  enabled?: boolean
  name?: string
  prompt?: string
  cron_expression?: string
  timezone?: string
}

export async function updateScheduledRun(
  id: string,
  input: UpdateScheduledRunInput,
): Promise<ScheduledRun> {
  const res = await authedFetch(
    `${BACKEND_URL}/api/v1/tenant-scheduled-runs/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
  if (!res.ok) await parseErrorAndThrow(res)
  const data = await res.json()
  return data.scheduled_run
}

export async function deleteScheduledRun(id: string): Promise<void> {
  const res = await authedFetch(
    `${BACKEND_URL}/api/v1/tenant-scheduled-runs/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
  if (!res.ok) await parseErrorAndThrow(res)
}

// ── Building a cron expression without asking anyone to write cron ───────

export type Cadence = 'daily' | 'weekdays' | 'weekly' | 'monthly'

export interface ScheduleShape {
  cadence: Cadence
  /** 0–23, the tenant's own local hour in `timezone`. */
  hour: number
  /** 0–59. */
  minute: number
  /** 0 = Sunday … 6 = Saturday. Only read for `weekly`. */
  weekday: number
  /** 1–28. Only read for `monthly`. */
  dayOfMonth: number
}

export const DEFAULT_SHAPE: ScheduleShape = {
  cadence: 'daily',
  hour: 9,
  minute: 0,
  weekday: 1,
  dayOfMonth: 1,
}

/**
 * Every shape here writes a literal minute, so none of them can trip the
 * backend's runaway-frequency floor (which rejects an every-minute field,
 * and any step finer than every 15 minutes). That is the point of offering
 * shapes rather than a cron box: the cheapest way to never generate a
 * schedule that bills every minute is to have no way to express one.
 */
export function buildCronExpression(shape: ScheduleShape): string {
  const m = clamp(shape.minute, 0, 59)
  const h = clamp(shape.hour, 0, 23)
  switch (shape.cadence) {
    case 'weekdays':
      return `${m} ${h} * * 1-5`
    case 'weekly':
      return `${m} ${h} * * ${clamp(shape.weekday, 0, 6)}`
    case 'monthly':
      // Capped at 28 so a monthly run never silently skips February.
      return `${m} ${h} ${clamp(shape.dayOfMonth, 1, 28)} * *`
    case 'daily':
    default:
      return `${m} ${h} * * *`
  }
}

/**
 * Read a stored expression back into the shape that produced it, so editing
 * an existing schedule reopens the same controls rather than starting over.
 * `null` for anything this builder could not have written — an expression
 * that came from somewhere else stays untouched and is shown verbatim,
 * which is safer than approximating it into the nearest shape and silently
 * rewriting the tenant's schedule on the next save.
 */
export function parseCronExpression(expr: string): ScheduleShape | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [minute, hour, dom, month, dow] = parts
  if (month !== '*') return null
  const m = toInt(minute, 0, 59)
  const h = toInt(hour, 0, 23)
  if (m === null || h === null) return null

  if (dom === '*' && dow === '*') return { ...DEFAULT_SHAPE, cadence: 'daily', hour: h, minute: m }
  if (dom === '*' && dow === '1-5') return { ...DEFAULT_SHAPE, cadence: 'weekdays', hour: h, minute: m }
  if (dom === '*') {
    const d = toInt(dow, 0, 6)
    return d === null ? null : { ...DEFAULT_SHAPE, cadence: 'weekly', hour: h, minute: m, weekday: d }
  }
  if (dow === '*') {
    const d = toInt(dom, 1, 28)
    return d === null ? null : { ...DEFAULT_SHAPE, cadence: 'monthly', hour: h, minute: m, dayOfMonth: d }
  }
  return null
}

/**
 * The browser's own IANA zone, which is the one the tenant means when they
 * say "9am". Falls back to UTC only if the runtime cannot tell us — never
 * to the server's zone, which is what ADR-009 §6a was written about.
 */
export function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Every zone this browser knows, with the detected one first. */
export function supportedTimeZones(): string[] {
  const detected = detectTimeZone()
  let all: string[] = []
  try {
    // Not in every runtime yet; the typings lag the implementations.
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf
    all = supported ? supported('timeZone') : []
  } catch {
    all = []
  }
  if (all.length === 0) return [detected, 'UTC'].filter(unique)
  return [detected, ...all].filter(unique)
}

function unique<T>(value: T, index: number, self: T[]): boolean {
  return self.indexOf(value) === index
}

function clamp(n: number, min: number, max: number): number {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : min
}

function toInt(raw: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return n >= min && n <= max ? n : null
}
