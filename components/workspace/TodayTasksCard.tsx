"use client"

/**
 * Console "Today" card: up to 5 of your open tasks that are overdue or due
 * today, with a link to Workspace › My tasks. Renders nothing when there
 * are none (or the load failed), so the home stays quiet.
 */
import { useMemo } from "react"
import Link from "next/link"
import { useMyTasks } from "@/hooks/useMyTasks"
import { localDayISO, myTaskHref, myTasksBadge, todayTasks } from "@/lib/myTasks"

export default function TodayTasksCard() {
  const { tasks } = useMyTasks()
  const today = useMemo(() => localDayISO(), [])
  const shown = useMemo(() => (tasks ? todayTasks(tasks, today, 5) : []), [tasks, today])
  const total = useMemo(() => (tasks ? myTasksBadge(tasks, today) : 0), [tasks, today])
  if (shown.length === 0) return null
  return (
    <div className="w-full rounded-2xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between px-1.5 pb-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-white/40">Today</span>
        <Link href="/workspace/my-tasks" className="text-[11.5px] text-white/45 hover:text-white/80">
          {total > shown.length ? `All ${total} in My tasks` : "My tasks"} →
        </Link>
      </div>
      <div className="flex flex-col">
        {shown.map((t) => {
          const overdue = t.due < today
          return (
            <Link key={`${t.docId}:${t.rowId}`} href={myTaskHref(t)} className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 hover:bg-white/[0.04]">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${overdue ? "bg-red-400" : "bg-amber-300"}`} />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/80">{t.title}</span>
              <span className="hidden min-w-0 max-w-[40%] truncate text-[11.5px] text-white/30 sm:block">{t.roomTitle}</span>
              <span className={`shrink-0 text-[11.5px] ${overdue ? "text-red-300" : "text-amber-200/80"}`}>{overdue ? "Overdue" : "Today"}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
