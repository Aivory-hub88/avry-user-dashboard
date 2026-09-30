/**
 * Composio keeps every connection attempt as its own connected account, so a
 * user who retries (or whose link expired) ends up with a pile of EXPIRED rows
 * per toolkit, and the Integrations list shows each as "Needs re-auth".
 *
 * Collapse to what the user actually needs to see: every ACTIVE account of a
 * toolkit (someone may legitimately have two Slack workspaces); if a toolkit
 * has none, only its most recent non-active one, so there is still a single
 * "Re-authenticate" row rather than five.
 */
type Account = {
  status?: unknown
  toolkit?: { slug?: unknown } | null
  createdAt?: unknown
}

const isActive = (a: Account) => String(a.status ?? '').toUpperCase() === 'ACTIVE'
const time = (a: Account) => {
  const t = Date.parse(String(a.createdAt ?? ''))
  return Number.isNaN(t) ? 0 : t
}

export function collapseAccounts<T extends Account>(items: T[]): T[] {
  const slugOf = (a: T) => String(a.toolkit?.slug ?? '').toLowerCase()
  const hasActive = new Set(items.filter(isActive).map(slugOf))
  const newestStale = new Map<string, T>()
  for (const a of items) {
    if (isActive(a)) continue
    const slug = slugOf(a)
    if (hasActive.has(slug)) continue
    const cur = newestStale.get(slug)
    if (!cur || time(a) > time(cur)) newestStale.set(slug, a)
  }
  return items.filter((a) => (isActive(a) ? true : !hasActive.has(slugOf(a)) && newestStale.get(slugOf(a)) === a))
}
