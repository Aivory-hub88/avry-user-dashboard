"use client"

/**
 * CRM workspace: Deals (pipeline board), Companies, Contacts. Text lives in
 * span/div only — the dashboard's global `main h1-h4` / `main p` rules would
 * override Tailwind on UI chrome.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { Trash2 } from "lucide-react"
import { Button, fieldClass } from "@/components/requests/requestUi"
import { crmApi, DEAL_STAGES, type Company, type Contact, type Deal, type DealStage } from "@/lib/crmClient"

type Tab = "deals" | "companies" | "contacts"

const STAGE_LABEL: Record<DealStage, string> = {
  lead: "Lead",
  qualified: "Qualified",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
}

const STAGE_DOT: Record<DealStage, string> = {
  lead: "bg-white/40",
  qualified: "bg-sky-400",
  proposal: "bg-amber-400",
  won: "bg-emerald-400",
  lost: "bg-red-400/70",
}

function ownerLabel(o: { owner_agent: string | null }): string | null {
  return o.owner_agent ? `${o.owner_agent} (agent)` : null
}

function money(v: number | null, currency: string | null): string {
  if (v === null) return ""
  return `${currency ? `${currency} ` : ""}${v.toLocaleString("en-US")}`
}

export default function CrmApp() {
  const [tab, setTab] = useState<Tab>("deals")
  const [companies, setCompanies] = useState<Company[] | null>(null)
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [deals, setDeals] = useState<Deal[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")

  const load = useCallback(async () => {
    try {
      const [c, p, d] = await Promise.all([crmApi.companies.list(), crmApi.contacts.list(), crmApi.deals.list()])
      setCompanies(c)
      setContacts(p)
      setDeals(d)
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

  const companyName = useMemo(() => new Map((companies ?? []).map((c) => [c.id, c.name])), [companies])
  const needle = q.trim().toLowerCase()
  const hit = (...parts: (string | null | undefined)[]) => !needle || parts.some((p) => p?.toLowerCase().includes(needle))

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const TABS: { key: Tab; label: string; count: number | undefined }[] = [
    { key: "deals", label: "Deals", count: deals?.length },
    { key: "companies", label: "Companies", count: companies?.length },
    { key: "contacts", label: "Contacts", count: contacts?.length },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line px-6 py-3">
        <div className="flex gap-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors ${
                tab === t.key ? "bg-white/[0.1] text-white" : "text-white/45 hover:text-white/75"
              }`}
            >
              {t.label}
              {t.count !== undefined && <span className="ml-1.5 text-white/35">{t.count}</span>}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          aria-label="Search"
          className={`ml-auto w-[220px] ${fieldClass}`}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {error && <div className="mb-4 rounded-xl bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">{error}</div>}

        {deals === null || companies === null || contacts === null ? (
          !error && <div className="h-40 animate-pulse rounded-2xl bg-white/[0.03]" />
        ) : tab === "deals" ? (
          <DealsTab
            deals={deals.filter((d) => hit(d.title, companyName.get(d.company_id ?? "")))}
            companies={companies}
            companyName={companyName}
            onCreate={(b) => run(() => crmApi.deals.create(b))}
            onStage={(id, s) => run(() => crmApi.deals.setStage(id, s))}
            onRemove={(id) => run(() => crmApi.deals.remove(id))}
          />
        ) : tab === "companies" ? (
          <CompaniesTab
            companies={companies.filter((c) => hit(c.name, c.domain, c.industry))}
            onCreate={(b) => run(() => crmApi.companies.create(b))}
            onRemove={(id) => run(() => crmApi.companies.remove(id))}
          />
        ) : (
          <ContactsTab
            contacts={contacts.filter((c) => hit(c.name, c.email, c.title, companyName.get(c.company_id ?? "")))}
            companies={companies}
            companyName={companyName}
            onCreate={(b) => run(() => crmApi.contacts.create(b))}
            onRemove={(id) => run(() => crmApi.contacts.remove(id))}
          />
        )}
      </div>
    </div>
  )
}

function AddRow({ children, onSubmit, disabled }: { children: React.ReactNode; onSubmit: () => void; disabled: boolean }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!disabled) onSubmit()
      }}
      className="mb-5 flex flex-wrap items-center gap-2"
    >
      {children}
      <Button tone="primary" type="submit" disabled={disabled}>
        Add
      </Button>
    </form>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line px-5 py-10 text-center text-[12px] text-white/35">{children}</div>
}

function DealsTab({
  deals,
  companies,
  companyName,
  onCreate,
  onStage,
  onRemove,
}: {
  deals: Deal[]
  companies: Company[]
  companyName: Map<string, string>
  onCreate: (b: { title: string; value?: number; company_id?: string }) => void
  onStage: (id: string, s: DealStage) => void
  onRemove: (id: string) => void
}) {
  const [title, setTitle] = useState("")
  const [value, setValue] = useState("")
  const [companyId, setCompanyId] = useState("")
  const parsed = value.trim() === "" ? undefined : Number(value)
  const invalid = title.trim().length < 2 || (parsed !== undefined && !Number.isInteger(parsed))

  return (
    <div>
      <AddRow
        disabled={invalid}
        onSubmit={() => {
          onCreate({ title: title.trim(), value: parsed, company_id: companyId || undefined })
          setTitle("")
          setValue("")
          setCompanyId("")
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New deal title" aria-label="Deal title" className={`w-[240px] ${fieldClass}`} />
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" inputMode="numeric" aria-label="Deal value" className={`w-[120px] ${fieldClass}`} />
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="Company" className={`w-[180px] ${fieldClass}`}>
          <option value="">No company</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </AddRow>

      <div className="grid gap-3 md:grid-cols-5">
        {DEAL_STAGES.map((stage) => {
          const col = deals.filter((d) => d.stage === stage)
          const total = col.reduce((n, d) => n + (d.value ?? 0), 0)
          return (
            <section key={stage} aria-label={STAGE_LABEL[stage]} className="min-w-0 rounded-2xl bg-white/[0.025] p-3">
              <div className="mb-3 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${STAGE_DOT[stage]}`} />
                <span className="text-[12px] font-medium text-white/75">{STAGE_LABEL[stage]}</span>
                <span className="text-[11px] text-white/30">{col.length}</span>
                {total > 0 && <span className="ml-auto text-[11px] text-white/35">{total.toLocaleString("en-US")}</span>}
              </div>
              <div className="space-y-2">
                {col.map((d) => (
                  <div key={d.id} className="rounded-xl border border-line bg-white/[0.04] p-3">
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 break-words text-[13px] text-white/85">{d.title}</span>
                      <button onClick={() => onRemove(d.id)} aria-label={`Delete ${d.title}`} className="text-white/25 hover:text-red-300">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="mt-1 text-[11px] text-white/40">
                      {[companyName.get(d.company_id ?? ""), money(d.value, d.currency), ownerLabel(d)].filter(Boolean).join(" · ")}
                    </div>
                    <select
                      value={d.stage}
                      onChange={(e) => onStage(d.id, e.target.value as DealStage)}
                      aria-label={`Stage of ${d.title}`}
                      className={`mt-2 w-full ${fieldClass} py-1 text-[12px]`}
                    >
                      {DEAL_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {STAGE_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                {col.length === 0 && <div className="px-1 py-3 text-[11px] text-white/25">No deals</div>}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function CompaniesTab({
  companies,
  onCreate,
  onRemove,
}: {
  companies: Company[]
  onCreate: (b: { name: string; domain?: string; industry?: string }) => void
  onRemove: (id: string) => void
}) {
  const [name, setName] = useState("")
  const [domain, setDomain] = useState("")
  const [industry, setIndustry] = useState("")
  return (
    <div className="mx-auto max-w-[900px]">
      <AddRow
        disabled={name.trim().length < 2}
        onSubmit={() => {
          onCreate({ name: name.trim(), domain, industry })
          setName("")
          setDomain("")
          setIndustry("")
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name" aria-label="Company name" className={`w-[220px] ${fieldClass}`} />
        <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="domain.com" aria-label="Domain" className={`w-[180px] ${fieldClass}`} />
        <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Industry" aria-label="Industry" className={`w-[160px] ${fieldClass}`} />
      </AddRow>
      {companies.length === 0 ? (
        <Empty>No companies yet. Add one above, or let an agent like Lex add them as it qualifies leads.</Empty>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {companies.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-white/85">{c.name}</div>
                <div className="truncate text-[11px] text-white/40">{[c.domain, c.industry, ownerLabel(c)].filter(Boolean).join(" · ")}</div>
              </div>
              <button onClick={() => onRemove(c.id)} aria-label={`Delete ${c.name}`} className="text-white/25 hover:text-red-300">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ContactsTab({
  contacts,
  companies,
  companyName,
  onCreate,
  onRemove,
}: {
  contacts: Contact[]
  companies: Company[]
  companyName: Map<string, string>
  onCreate: (b: { name: string; email?: string; title?: string; company_id?: string }) => void
  onRemove: (id: string) => void
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [title, setTitle] = useState("")
  const [companyId, setCompanyId] = useState("")
  return (
    <div className="mx-auto max-w-[900px]">
      <AddRow
        disabled={name.trim().length < 2}
        onSubmit={() => {
          onCreate({ name: name.trim(), email, title, company_id: companyId || undefined })
          setName("")
          setEmail("")
          setTitle("")
          setCompanyId("")
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" aria-label="Full name" className={`w-[180px] ${fieldClass}`} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" className={`w-[200px] ${fieldClass}`} />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" className={`w-[140px] ${fieldClass}`} />
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="Company" className={`w-[170px] ${fieldClass}`}>
          <option value="">No company</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </AddRow>
      {contacts.length === 0 ? (
        <Empty>No contacts yet.</Empty>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-white/85">{c.name}</div>
                <div className="truncate text-[11px] text-white/40">
                  {[c.title, companyName.get(c.company_id ?? ""), c.email, ownerLabel(c)].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button onClick={() => onRemove(c.id)} aria-label={`Delete ${c.name}`} className="text-white/25 hover:text-red-300">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
