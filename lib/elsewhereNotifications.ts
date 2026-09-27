/**
 * "Waiting on you elsewhere": what other agents have for you, summarised for
 * the rail of the agent you're currently looking at.
 *
 * The agent-column badge counts every notification kind (approval, activity,
 * status, connection — see hooks/useNotificationFeed). This section used to
 * summarise approvals only, so a badge raised by anything else (a new reply
 * from Lex, an expiring Odoo key, a failed schedule) showed "1" on the
 * avatar with nothing on the rail explaining what it was. Every kind the
 * badge counts is now named here, so the badge and the rail always agree.
 */
import type { Notification } from '@/types/notifications'
import { readVerifierFinding } from '@/lib/agentApprovals'

export interface ElsewhereWaiting {
  agentType: string
  name: string
  /** Same number as the agent-column badge for this agent. */
  count: number
  tone: 'error' | 'warn' | 'info'
  title: string
  subtitle: string
  /** Set when the only thing waiting is one unread thread: open it directly. */
  sessionId?: string
}

type Of<K extends Notification['kind']> = Extract<Notification, { kind: K }>

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function expiresIn(daysLeft: number | null): string {
  if (daysLeft === null) return 'soon'
  if (daysLeft <= 0) return 'today'
  return `in ${plural(daysLeft, 'day', 'days')}`
}

function describeConnection(c: Of<'connection'>): string {
  return c.state === 'failed'
    ? `${c.serverName} connection stopped working`
    : `${c.serverName} API key expires ${expiresIn(c.daysLeft)}`
}

export function summarizeAgentNotifications(
  agentType: string,
  name: string,
  items: Notification[],
): ElsewhereWaiting | null {
  if (items.length === 0) return null
  const approvals = items.filter((n): n is Of<'approval'> => n.kind === 'approval')
  const connections = items.filter((n): n is Of<'connection'> => n.kind === 'connection')
  const statuses = items.filter((n): n is Of<'status'> => n.kind === 'status')
  const activity = items.filter((n): n is Of<'activity'> => n.kind === 'activity')

  const flagged = approvals.some((a) => readVerifierFinding(a.approval)?.verdict === 'flag')
  const failedConnection = connections.some((c) => c.state === 'failed')

  // One line per kind, most urgent first — the subtitle names everything the
  // badge counted.
  const parts: string[] = []
  if (approvals.length > 0) {
    parts.push(`${plural(approvals.length, 'approval', 'approvals')} waiting${flagged ? ' (one flagged)' : ''}`)
  }
  for (const c of connections) parts.push(describeConnection(c))
  for (const s of statuses) parts.push(`scheduled run “${s.title}” isn’t running`)
  if (activity.length === 1) parts.push(`new reply in “${activity[0].title}”`)
  else if (activity.length > 1) parts.push(`new replies in ${activity.length} threads`)

  let title: string
  if (approvals.length > 0) title = `${name} needs your approval`
  else if (failedConnection || statuses.length > 0) title = `${name} needs attention`
  else if (connections.length > 0) title = `${name}: ${describeConnection(connections[0])}`
  else title = activity.length === 1 ? `New reply from ${name}` : `New replies from ${name}`

  const tone: ElsewhereWaiting['tone'] =
    flagged || failedConnection || statuses.length > 0
      ? 'error'
      : approvals.length > 0 || connections.length > 0
        ? 'warn'
        : 'info'

  const onlyOneThread = activity.length === 1 && items.length === 1
  const detail = parts.join(' · ')
  const subtitle = onlyOneThread
    ? `${detail[0].toUpperCase()}${detail.slice(1)}. Tap to open it.`
    : `${detail[0].toUpperCase()}${detail.slice(1)}. Open ${name} to see it.`

  return {
    agentType,
    name,
    count: items.length,
    tone,
    title,
    subtitle,
    ...(onlyOneThread ? { sessionId: activity[0].sessionId } : {}),
  }
}

/**
 * Every agent other than the one open in the rail (and never the plain
 * Aivory Console, key "null"), in column order is not guaranteed — callers
 * sort if they care. Agents with nothing waiting are omitted.
 */
export function summarizeElsewhere(
  notificationsByAgent: Record<string, Notification[]>,
  currentAgent: string | null,
  nameOf: (agentType: string) => string,
): ElsewhereWaiting[] {
  const current = currentAgent ?? 'null'
  return Object.entries(notificationsByAgent)
    .filter(([key]) => key !== current && key !== 'null')
    .map(([key, items]) => summarizeAgentNotifications(key, nameOf(key), items))
    .filter((w): w is ElsewhereWaiting => w !== null)
}
