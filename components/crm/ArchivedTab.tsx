"use client"

/**
 * Archived companies, contacts and deals. Archiving (by you or an agent) hides a record
 * without deleting it; restoring puts it back where it was.
 */
import { useCallback, useEffect, useState } from "react"
import { crmApi, type Company, type Contact, type Deal } from "@/lib/crmClient"
import type { SubjectType } from "@/lib/crmActivity"

type Row = { type: SubjectType; id: string; name: string; sub: string; at: string | null; by: string }

const who = (o: { owner_agent: string | null }) => (o.owner_agent ? `agent ${o.owner_agent}` : "you")

export function toRows(companies: Company[], contacts: Contact[], deals: Deal[]): Row[] {
  const rows: Row[] = [
    ...companies.map((c) => ({ type: "company" as const, id: c.id, name: c.name, sub: c.domain ?? "Company", at: c.archived_at ?? null, by: who(c) })),
    ...contacts.map((c) => ({ type: "contact" as const, id: c.id, name: c.name, sub: c.email ?? c.phone ?? "Contact", at: c.archived_at ?? null, by: who(c) })),
    ...deals.map((d) => ({ type: "deal" as const, id: d.id, name: d.title, sub: `Deal · ${d.stage}`, at: d.archived_at ?? null, by: who(d) })),
  ]
  return rows.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
}

export default function ArchivedTab({ onChanged, onOpen }: { onChanged: () => void; onOpen: (t: SubjectType, id: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [c, p, d] = await Promise.all([crmApi.companies.archived(), crmApi.contacts.archived(), crmApi.deals.archived()])
      setRows(toRows(c, p, d))
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    // Fetch on mount; load() only sets state after its await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const restore = async (r: Row) => {
    try {
      const api = r.type === "company" ? crmApi.companies : r.type === "contact" ? crmApi.contacts : crmApi.deals
      await api.setArchived(r.id, false)
      await load()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (rows === null) return error ? <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">{error}</div> : <div className="h-40 animate-pulse rounded-2xl bg-white/[0.03]" />
  return (
    <div className="space-y-3">
      {error && <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">{error}</div>}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-line px-6 py-10 text-center text-[13px] text-white/50">Nothing archived. Archived records are hidden, not deleted, and can be restored here.</div>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {rows.map((r) => (
            <li key={`${r.type}-${r.id}`} className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => onOpen(r.type, r.id)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-[13px] text-white/85">{r.name}</div>
                <div className="truncate text-[12px] text-white/40">
                  {r.sub} · {r.type}
                  {r.at ? ` · archived ${new Date(r.at).toLocaleDateString()}` : ""} · created by {r.by}
                </div>
              </button>
              <button onClick={() => void restore(r)} className="rounded-full border border-line px-3 py-1 text-[12px] text-white/70 hover:text-white">
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
