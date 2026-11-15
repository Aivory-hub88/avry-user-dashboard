"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useMyTasks } from "@/hooks/useMyTasks"
import { MY_TASK_TABS, groupMyTasks, localDayISO, myTaskHref, type MyTask, type MyTaskGroup, type MyTaskRole } from "@/lib/myTasks"

import { statusGroup, STATUS_GROUP_LABEL, type StatusGroup } from "@/lib/workspaceDbModel"

/** Rooms name their own statuses; the dot follows the status's group. */
const GROUP_DOT: Record<StatusGroup, string> = {
  todo: "bg-white/40",
  in_progress: "bg-amber-400",
  done: "bg-emerald-400",
  canceled: "bg-red-400/60",
}
const GROUP_TONE: Record<MyTaskGroup, string> = {
  Overdue: "text-red-300",
  Today: "text-amber-200",
  "This week": "text-white/55",
  Later: "text-white/40",
  "No date": "text-white/40",
}

function fmtDue(due: string, today: string): string {
  if (!due) return ""
  if (due === today) return "Today"
  return new Date(`${due}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

function TaskLine({ t, today }: { t: MyTask; today: string }) {
  const overdue = !!t.due && t.due < today
  const group = t.statusGroup ?? statusGroup([], t.status)
  return (
    <Link
      href={myTaskHref(t)}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.04]"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${GROUP_DOT[group]}`} title={`${t.status} · ${STATUS_GROUP_LABEL[group]}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-white/85">{t.title}</span>
        <span className="block truncate text-[11.5px] text-white/35">{t.roomTitle}</span>
      </span>
      {t.priority === "High" && <span className="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[10.5px] text-red-300">High</span>}
      {t.due && <span className={`shrink-0 text-[12px] tabular-nums ${overdue ? "text-red-300" : "text-white/45"}`}>{fmtDue(t.due, today)}</span>}
    </Link>
  )
}

export default function MyTasks() {
  const { tasks, error, reload } = useMyTasks()
  const [role, setRole] = useState<MyTaskRole>("assignee")
  const today = useMemo(() => localDayISO(), [])
  const groups = useMemo(() => (tasks ? groupMyTasks(tasks, role, today) : []), [tasks, role, today])
  const counts = useMemo(() => {
    const c: Record<MyTaskRole, number> = { assignee: 0, owner: 0, follower: 0, creator: 0 }
    for (const t of tasks ?? []) for (const r of t.roles) c[r]++
    return c
  }, [tasks])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[760px] px-4 py-6 sm:px-6">
        <div role="tablist" aria-label="Which tasks" className="flex flex-wrap gap-1">
          {MY_TASK_TABS.map((tab) => (
            <button
              key={tab.role}
              type="button"
              role="tab"
              aria-selected={role === tab.role}
              onClick={() => setRole(tab.role)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${role === tab.role ? "bg-white/[0.1] text-white" : "text-white/50 hover:text-white/80"}`}
            >
              {tab.label}
              {counts[tab.role] > 0 && <span className="ml-1.5 tabular-nums text-white/35">{counts[tab.role]}</span>}
            </button>
          ))}
        </div>

        {tasks === null ? (
          <div className="py-16 text-center text-[13px] text-white/35">Loading your tasks…</div>
        ) : error && tasks.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-white/45">
            Couldn&apos;t load your tasks.{" "}
            <button type="button" onClick={reload} className="text-white/75 underline underline-offset-2">
              Try again
            </button>
          </div>
        ) : groups.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/10 py-14 text-center">
            <div className="text-[13px] text-white/60">Nothing here</div>
            <div className="mt-1 text-[12px] text-white/35">
              {role === "follower" ? "Follow a task from its drawer to see it here." : "Open tasks from your rooms show up here."}
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-6">
            {groups.map((g) => (
              <section key={g.group} aria-label={g.group}>
                <h2 className={`px-3 text-[11px] font-medium uppercase tracking-wider ${GROUP_TONE[g.group]}`}>
                  {g.group} <span className="tabular-nums text-white/30">· {g.tasks.length}</span>
                </h2>
                <div className="mt-1.5 flex flex-col">
                  {g.tasks.map((t) => (
                    <TaskLine key={`${t.docId}:${t.rowId}`} t={t} today={today} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
