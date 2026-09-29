"use client"

/** Activity tab: follow-ups (entries with a due date) and the latest entries across every record. */
import { useCallback, useEffect, useMemo, useState } from "react"
import ActivityItem from "@/components/crm/ActivityItem"
import { crmApi, type Activity } from "@/lib/crmClient"
import { sortFollowUps, type SubjectType } from "@/lib/crmActivity"
import type { Subject } from "@/components/crm/ActivityPanel"

const RECENT_SHOWN = 50

export default function ActivityFeed({
  names,
  query,
  version,
  onOpen,
  onError,
}: {
  names: Map<string, string>
  query: string
  version: number
  onOpen: (s: Subject) => void
  onError: (m: string | null) => void
}) {
  const [recent, setRecent] = useState<Activity[] | null>(null)
  const [followUps, setFollowUps] = useState<Activity[] | null>(null)

  const load = useCallback(async () => {
    try {
      const [r, f] = await Promise.all([crmApi.activities.list(), crmApi.activities.list({ has_due: true })])
      setRecent(r)
      setFollowUps(f)
    } catch (e) {
      onError((e as Error).message)
    }
  }, [onError])

  useEffect(() => {
    // Fetch on mount and whenever a panel changed something; load() only sets state after its await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load, version])

  const nameOf = (a: Activity) => names.get(`${a.subject_type}:${a.subject_id}`) ?? "(deleted)"
  const needle = query.trim().toLowerCase()
  const visible = (rows: Activity[]) => (needle ? rows.filter((a) => (a.body ?? "").toLowerCase().includes(needle) || nameOf(a).toLowerCase().includes(needle)) : rows)
  const upcoming = useMemo(() => sortFollowUps(visible(followUps ?? [])), [followUps, needle, names]) // eslint-disable-line react-hooks/exhaustive-deps
  const latest = visible(recent ?? []).slice(0, RECENT_SHOWN)

  const row = (a: Activity) => (
    <ActivityItem
      key={a.id}
      a={a}
      subjectName={nameOf(a)}
      onOpenSubject={() => {
        const name = names.get(`${a.subject_type}:${a.subject_id}`)
        if (name) onOpen({ type: a.subject_type as SubjectType, id: a.subject_id, name })
      }}
    />
  )

  if (recent === null || followUps === null) return <div className="mx-auto h-40 max-w-[760px] animate-pulse rounded-2xl bg-white/[0.03]" />

  return (
    <div className="mx-auto max-w-[760px] space-y-8">
      <section aria-label="Follow-ups">
        <div className="mb-2 text-[12px] font-medium text-white/60">
          Follow-ups <span className="text-white/30">{upcoming.length}</span>
        </div>
        {upcoming.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-[12px] text-white/35">
            No follow-ups. Log an activity with a follow-up time from any deal, company or contact.
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line">{upcoming.map(row)}</ul>
        )}
      </section>

      <section aria-label="Recent activity">
        <div className="mb-2 text-[12px] font-medium text-white/60">Recent</div>
        {latest.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-[12px] text-white/35">Nothing logged yet.</div>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line">{latest.map(row)}</ul>
        )}
      </section>
    </div>
  )
}
