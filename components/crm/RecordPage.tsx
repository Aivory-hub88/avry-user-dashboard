"use client"

/**
 * One CRM record — a company, contact or deal — as a page: header, a timeline
 * of everything logged against it, the records it links to, and every field
 * editable in place (including custom fields). Text lives in span/div only —
 * the dashboard's global `main h1-h4` / `main p` rules would override Tailwind.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRight, Plus, Trash2, X } from "lucide-react"
import { Button, fieldClass } from "@/components/requests/requestUi"
import ActivityTimeline from "@/components/crm/ActivityTimeline"
import { agentLabel, SUBJECT_LABEL, type SubjectType } from "@/lib/crmActivity"
import { crmApi, DEAL_STAGES, type Company, type Contact, type Deal, type DealStage } from "@/lib/crmClient"
import { customFieldText, daysUntil, type CompanyChanges, type ContactChanges, type DealChanges, formatMoney, isPastClose, pipelineSummary, sharedCurrency, validFieldName } from "@/lib/crmPipeline"
import { STAGE_DOT, STAGE_LABEL, crmHref } from "@/components/crm/crmUi"

type Rec = { type: "company"; r: Company } | { type: "contact"; r: Contact } | { type: "deal"; r: Deal }
type Tab = "timeline" | "deals" | "people"

const LIST_TAB: Record<SubjectType, string> = { company: "companies", contact: "contacts", deal: "deals" }
const LIST_LABEL: Record<SubjectType, string> = { company: "Companies", contact: "Contacts", deal: "Deals" }

function recName(rec: Rec): string {
  return rec.type === "deal" ? rec.r.title : rec.r.name
}

export default function RecordPage({ type, id }: { type: SubjectType; id: string }) {
  const router = useRouter()
  const [rec, setRec] = useState<Rec | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [tab, setTab] = useState<Tab>("timeline")
  const [activityCount, setActivityCount] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(async () => {
    try {
      const one =
        type === "company"
          ? ({ type, r: await crmApi.companies.get(id) } as Rec)
          : type === "contact"
            ? ({ type, r: await crmApi.contacts.get(id) } as Rec)
            : ({ type, r: await crmApi.deals.get(id) } as Rec)
      const [c, p, d] = await Promise.all([crmApi.companies.list(), crmApi.contacts.list(), crmApi.deals.list()])
      setRec(one)
      setCompanies(c)
      setContacts(p)
      setDeals(d)
      setError(null)
    } catch (e) {
      const status = (e as { status?: number }).status
      if (status === 404 || status === 400) setMissing(true)
      else setError((e as Error).message)
    }
  }, [type, id])

  useEffect(() => {
    // Fetch on mount; load() only sets state after its await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const save = async (changes: Record<string, unknown>) => {
    if (!rec) return
    setError(null)
    try {
      if (rec.type === "company") setRec({ type: "company", r: await crmApi.companies.update(rec.r, changes as CompanyChanges) })
      else if (rec.type === "contact") setRec({ type: "contact", r: await crmApi.contacts.update(rec.r, changes as ContactChanges) })
      else setRec({ type: "deal", r: await crmApi.deals.update(rec.r, changes as DealChanges) })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const companyName = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies])

  const related = useMemo(() => {
    if (!rec) return { deals: [] as Deal[], people: [] as Contact[] }
    if (rec.type === "company") return { deals: deals.filter((d) => d.company_id === rec.r.id), people: contacts.filter((c) => c.company_id === rec.r.id) }
    if (rec.type === "contact") return { deals: deals.filter((d) => d.contact_ids.includes(rec.r.id)), people: [] }
    return { deals: [], people: contacts.filter((c) => rec.r.contact_ids.includes(c.id)) }
  }, [rec, deals, contacts])

  const tabs: { key: Tab; label: string; count?: number | null }[] = !rec
    ? []
    : [
        { key: "timeline", label: "Timeline", count: activityCount },
        ...(rec.type !== "deal" ? [{ key: "deals" as Tab, label: "Deals", count: related.deals.length }] : []),
        ...(rec.type !== "contact" ? [{ key: "people" as Tab, label: "People", count: related.people.length }] : []),
      ]

  const remove = async () => {
    if (!rec) return
    setError(null)
    try {
      if (rec.type === "company") await crmApi.companies.remove(rec.r.id)
      else if (rec.type === "contact") await crmApi.contacts.remove(rec.r.id)
      else await crmApi.deals.remove(rec.r.id)
      router.push(crmHref(LIST_TAB[type]))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-black/10 px-6 text-[13px]">
        <Link href="/crm" className="text-white/50 hover:text-white/80">
          CRM
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-white/25" />
        <Link href={crmHref(LIST_TAB[type])} className="text-white/50 hover:text-white/80">
          {LIST_LABEL[type]}
        </Link>
        {rec && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-white/25" />
            <span className="truncate font-medium text-white/85">{recName(rec)}</span>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {missing ? (
          <div className="mx-auto mt-16 max-w-[420px] rounded-2xl border border-line px-6 py-10 text-center">
            <div className="text-[15px] text-white/85">This {SUBJECT_LABEL[type].toLowerCase()} no longer exists</div>
            <div className="mt-2 text-[13px] text-white/45">It may have been deleted by you or one of your agents.</div>
            <Link href={crmHref(LIST_TAB[type])} className="mt-5 inline-block rounded-full bg-white px-4 py-2 text-[12px] font-medium text-black">
              Back to {LIST_LABEL[type].toLowerCase()}
            </Link>
          </div>
        ) : !rec ? (
          <div className="px-8 py-8">
            {error ? <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">{error}</div> : <div className="h-40 animate-pulse rounded-2xl bg-white/[0.03]" />}
          </div>
        ) : (
          <>
            <Header rec={rec} companyName={companyName} onRename={(name) => save(rec.type === "deal" ? { title: name } : { name })} />

            <div className="mt-4 flex flex-wrap items-center gap-1 border-b border-line px-8" role="tablist">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={`-mb-px border-b-2 px-3 py-2.5 text-[13px] transition-colors ${tab === t.key ? "border-white font-medium text-white" : "border-transparent text-white/55 hover:text-white/85"}`}
                >
                  {t.label}
                  {t.count != null && <span className="ml-1.5 text-white/40">{t.count}</span>}
                </button>
              ))}
              <span className="ml-auto pb-1">
                {confirmDelete ? (
                  <span className="text-[12px] text-white/55">
                    Delete for good?{" "}
                    <button onClick={() => void remove()} className="text-red-300 hover:text-red-200">
                      Delete
                    </button>
                    {" · "}
                    <button onClick={() => setConfirmDelete(false)} className="hover:text-white/85">
                      Keep
                    </button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-[12px] text-white/40 hover:text-red-300">
                    <Trash2 size={13} /> Delete
                  </button>
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-start gap-6 px-8 pb-12 pt-6">
              <div className="min-w-0 flex-[999_1_520px] space-y-4">
                {error && <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">{error}</div>}
                {tab === "timeline" && <ActivityTimeline subjectType={type} subjectId={id} subjectName={recName(rec)} onCount={setActivityCount} />}
                {tab === "deals" && (
                  <RelatedDeals
                    deals={related.deals}
                    companyName={companyName}
                    onCreate={
                      rec.type === "company"
                        ? (b) => run(() => crmApi.deals.create({ ...b, company_id: rec.r.id }))
                        : rec.type === "contact"
                          ? (b) => run(() => crmApi.deals.create({ ...b, company_id: rec.r.company_id ?? undefined, contact_ids: [rec.r.id] }))
                          : undefined
                    }
                  />
                )}
                {tab === "people" && rec.type === "company" && (
                  <RelatedPeople people={related.people} onCreate={(b) => run(() => crmApi.contacts.create({ ...b, company_id: rec.r.id }))} />
                )}
                {tab === "people" && rec.type === "deal" && (
                  <RelatedPeople
                    people={related.people}
                    candidates={contacts.filter((c) => !rec.r.contact_ids.includes(c.id))}
                    onLink={(cid) => save({ contact_ids: [...rec.r.contact_ids, cid] })}
                    onUnlink={(cid) => save({ contact_ids: rec.r.contact_ids.filter((x) => x !== cid) })}
                  />
                )}
              </div>

              <aside className="min-w-0 flex-[1_1_300px] space-y-4">
                {rec.type !== "deal" && <PipelineCard deals={related.deals} />}
                {rec.type === "deal" && <DealCard deal={rec.r} onSave={save} />}
                {rec.type === "contact" && rec.r.company_id && companyName.has(rec.r.company_id) && (
                  <LinkCard label="Company" href={crmHref("company", rec.r.company_id)} name={companyName.get(rec.r.company_id) as string} />
                )}
                {rec.type === "deal" && rec.r.company_id && companyName.has(rec.r.company_id) && (
                  <LinkCard label="Company" href={crmHref("company", rec.r.company_id)} name={companyName.get(rec.r.company_id) as string} />
                )}
                <Details rec={rec} companies={companies} onSave={save} />
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Header({ rec, companyName, onRename }: { rec: Rec; companyName: Map<string, string>; onRename: (name: string) => void }) {
  const name = recName(rec)
  const meta: string[] =
    rec.type === "company"
      ? [rec.r.domain, rec.r.industry, rec.r.size ? `${rec.r.size} people` : null].filter(Boolean) as string[]
      : rec.type === "contact"
        ? [rec.r.title, rec.r.company_id ? companyName.get(rec.r.company_id) : null, rec.r.email].filter(Boolean) as string[]
        : [STAGE_LABEL[rec.r.stage], rec.r.value !== null ? formatMoney(rec.r.value, rec.r.currency) : null, rec.r.company_id ? companyName.get(rec.r.company_id) : null].filter(Boolean) as string[]
  return (
    <div className="flex flex-wrap items-center gap-4 px-8 pt-7">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-white/[0.08] text-[19px] font-medium text-white">
        {name.trim().charAt(0).toUpperCase() || "?"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-white/45">{SUBJECT_LABEL[rec.type]}</div>
        <InlineText value={name} onSave={(v) => v.trim().length >= 2 && onRename(v)} ariaLabel="Name" className="-ml-2 w-full max-w-[640px] text-[22px] font-normal text-white" />
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-white/55">
          {meta.map((m, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-white/25">·</span>}
              {m}
            </span>
          ))}
          {rec.r.owner_agent && (
            <span className="ml-1 rounded-full bg-sky-400/10 px-2 py-0.5 text-[11px] text-sky-200">Owner: {agentLabel(rec.r.owner_agent)}</span>
          )}
        </div>
      </div>
    </div>
  )
}

/** A text input that looks like plain text until hovered/focused; saves on blur or Enter when changed. */
function InlineText({
  value,
  onSave,
  ariaLabel,
  placeholder = "Empty",
  type = "text",
  className = "",
}: {
  value: string
  onSave: (v: string) => void
  ariaLabel: string
  placeholder?: string
  type?: "text" | "number" | "date" | "email" | "tel"
  className?: string
}) {
  const [draft, setDraft] = useState(value)
  const [prev, setPrev] = useState(value)
  if (prev !== value) {
    // Adopt a new saved value (render-phase sync, no effect needed).
    setPrev(value)
    setDraft(value)
  }
  const commit = () => {
    if (draft !== value) onSave(draft)
  }
  return (
    <input
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        if (e.key === "Escape") {
          setDraft(value)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={`min-w-0 rounded-lg border border-transparent bg-transparent px-2 py-1 outline-none transition-colors placeholder:text-white/25 hover:border-white/10 focus:border-white/25 focus:bg-white/[0.04] ${className}`}
    />
  )
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-medium text-white/85">{title}</span>
        {action}
      </div>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-2 py-0.5">
      <span className="truncate text-[12px] text-white/55">{label}</span>
      {children}
    </div>
  )
}

function Details({ rec, companies, onSave }: { rec: Rec; companies: Company[]; onSave: (ch: Record<string, unknown>) => void }) {
  const [newField, setNewField] = useState("")
  const custom = rec.r.custom_fields ?? {}
  const t = "w-full text-[13px] text-white/90"
  const setCustom = (key: string, v: string) => onSave({ custom_fields: { ...custom, [key]: v } })
  const dropCustom = (key: string) => {
    const next = { ...custom }
    delete next[key]
    onSave({ custom_fields: next })
  }
  const addField = () => {
    const name = validFieldName(newField, custom)
    if (!name) return
    onSave({ custom_fields: { ...custom, [name]: "" } })
    setNewField("")
  }

  return (
    <Card title="Details">
      {rec.type === "company" && (
        <>
          <Row label="Domain"><InlineText value={rec.r.domain ?? ""} onSave={(v) => onSave({ domain: v })} ariaLabel="Domain" className={t} /></Row>
          <Row label="Industry"><InlineText value={rec.r.industry ?? ""} onSave={(v) => onSave({ industry: v })} ariaLabel="Industry" className={t} /></Row>
          <Row label="Size"><InlineText value={rec.r.size ?? ""} onSave={(v) => onSave({ size: v })} ariaLabel="Size" placeholder="e.g. 11-50" className={t} /></Row>
        </>
      )}
      {rec.type === "contact" && (
        <>
          <Row label="Email"><InlineText type="email" value={rec.r.email ?? ""} onSave={(v) => onSave({ email: v })} ariaLabel="Email" className={t} /></Row>
          <Row label="Phone"><InlineText type="tel" value={rec.r.phone ?? ""} onSave={(v) => onSave({ phone: v })} ariaLabel="Phone" className={t} /></Row>
          <Row label="Title"><InlineText value={rec.r.title ?? ""} onSave={(v) => onSave({ title: v })} ariaLabel="Title" className={t} /></Row>
          <Row label="Company"><CompanySelect value={rec.r.company_id} companies={companies} onChange={(v) => onSave({ company_id: v })} /></Row>
        </>
      )}
      {rec.type === "deal" && (
        <Row label="Company"><CompanySelect value={rec.r.company_id} companies={companies} onChange={(v) => onSave({ company_id: v })} /></Row>
      )}
      {Object.keys(custom).map((k) => (
        <Row key={k} label={k}>
          <span className="group flex items-center">
            <InlineText value={customFieldText(custom[k])} onSave={(v) => setCustom(k, v)} ariaLabel={k} className={t} />
            <button onClick={() => dropCustom(k)} aria-label={`Remove field ${k}`} className="ml-1 text-white/0 transition-colors hover:text-red-300 group-hover:text-white/35">
              <X size={13} />
            </button>
          </span>
        </Row>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          addField()
        }}
        className="mt-2 flex items-center gap-2"
      >
        <input value={newField} onChange={(e) => setNewField(e.target.value)} placeholder="Add a field" aria-label="New field name" maxLength={40} className={`min-w-0 flex-1 ${fieldClass} py-1.5 text-[12px]`} />
        <Button type="submit" disabled={!validFieldName(newField, custom)}>
          Add
        </Button>
      </form>
    </Card>
  )
}

function CompanySelect({ value, companies, onChange }: { value: string | null; companies: Company[]; onChange: (v: string | null) => void }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} aria-label="Company" className="w-full rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-[13px] text-white/90 outline-none hover:border-white/10 focus:border-white/25">
      <option value="">No company</option>
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  )
}

function DealCard({ deal, onSave }: { deal: Deal; onSave: (ch: Record<string, unknown>) => void }) {
  const days = daysUntil(deal.expected_close_date)
  const late = isPastClose(deal)
  return (
    <Card title="Deal">
      <div className="mb-3 flex flex-wrap gap-1" role="radiogroup" aria-label="Stage">
        {DEAL_STAGES.map((s) => (
          <button
            key={s}
            role="radio"
            aria-checked={deal.stage === s}
            onClick={() => deal.stage !== s && onSave({ stage: s as DealStage })}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] transition-colors ${deal.stage === s ? "bg-white/[0.12] text-white" : "text-white/50 hover:text-white/85"}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${STAGE_DOT[s]}`} />
            {STAGE_LABEL[s]}
          </button>
        ))}
      </div>
      <Row label="Value">
        <InlineText
          type="number"
          value={deal.value === null ? "" : String(deal.value)}
          onSave={(v) => {
            const n = v.trim() === "" ? null : Number(v)
            if (n === null || Number.isInteger(n)) onSave({ value: n })
          }}
          ariaLabel="Value"
          className="w-full text-[13px] text-white/90"
        />
      </Row>
      <Row label="Currency"><InlineText value={deal.currency ?? ""} onSave={(v) => onSave({ currency: v.toUpperCase() })} ariaLabel="Currency" placeholder="e.g. USD" className="w-full text-[13px] text-white/90" /></Row>
      <Row label="Close date">
        <span className="flex items-center gap-2">
          <InlineText type="date" value={deal.expected_close_date ?? ""} onSave={(v) => onSave({ expected_close_date: v || null })} ariaLabel="Expected close date" className="w-full text-[13px] text-white/90 [color-scheme:dark]" />
          {days !== null && (
            <span className={`shrink-0 text-[11px] ${late ? "text-amber-300" : "text-white/45"}`}>{late ? `${-days} d late` : days === 0 ? "today" : days > 0 ? `in ${days} d` : ""}</span>
          )}
        </span>
      </Row>
    </Card>
  )
}

function PipelineCard({ deals }: { deals: Deal[] }) {
  const s = pipelineSummary(deals)
  const cur = sharedCurrency(deals)
  return (
    <Card title="Pipeline">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] text-white/55">Open deals · {s.openCount}</div>
          <div className="mt-1 text-[18px] font-light text-white">{formatMoney(s.openValue, cur)}</div>
        </div>
        <div>
          <div className="text-[11px] text-white/55">Won · {s.wonCount}</div>
          <div className="mt-1 text-[18px] font-light text-white">{formatMoney(s.wonValue, cur)}</div>
        </div>
      </div>
    </Card>
  )
}

function LinkCard({ label, href, name }: { label: string; href: string; name: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3 transition-colors hover:bg-white/[0.03]">
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/[0.08] text-[13px] text-white">{name.charAt(0).toUpperCase()}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] text-white/50">{label}</span>
        <span className="block truncate text-[13px] text-white/90">{name}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-white/30" />
    </Link>
  )
}

function RelatedDeals({ deals, companyName, onCreate }: { deals: Deal[]; companyName: Map<string, string>; onCreate?: (b: { title: string; value?: number }) => void }) {
  const [title, setTitle] = useState("")
  const [value, setValue] = useState("")
  const parsed = value.trim() === "" ? undefined : Number(value)
  const invalid = title.trim().length < 2 || (parsed !== undefined && !Number.isInteger(parsed))
  return (
    <div className="space-y-3">
      {onCreate && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (invalid) return
            onCreate({ title: title.trim(), value: parsed })
            setTitle("")
            setValue("")
          }}
          className="flex flex-wrap gap-2"
        >
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New deal title" aria-label="Deal title" className={`min-w-0 flex-1 ${fieldClass}`} />
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" inputMode="numeric" aria-label="Deal value" className={`w-[110px] ${fieldClass}`} />
          <Button tone="primary" type="submit" disabled={invalid}>
            <span className="flex items-center gap-1"><Plus size={13} /> Deal</span>
          </Button>
        </form>
      )}
      {deals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-[12px] text-white/40">No deals yet.</div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {deals.map((d) => (
            <li key={d.id}>
              <Link href={crmHref("deal", d.id)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STAGE_DOT[d.stage]}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-white/90">{d.title}</span>
                  <span className="block truncate text-[11px] text-white/50">
                    {[STAGE_LABEL[d.stage], d.value !== null ? formatMoney(d.value, d.currency) : null, d.company_id ? companyName.get(d.company_id) : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-white/25" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RelatedPeople({
  people,
  onCreate,
  candidates,
  onLink,
  onUnlink,
}: {
  people: Contact[]
  onCreate?: (b: { name: string; email?: string; title?: string }) => void
  candidates?: Contact[]
  onLink?: (id: string) => void
  onUnlink?: (id: string) => void
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [title, setTitle] = useState("")
  return (
    <div className="space-y-3">
      {onCreate && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim().length < 2) return
            onCreate({ name: name.trim(), email, title })
            setName("")
            setEmail("")
            setTitle("")
          }}
          className="flex flex-wrap gap-2"
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" aria-label="Full name" className={`min-w-0 flex-1 ${fieldClass}`} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" className={`w-[180px] ${fieldClass}`} />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" className={`w-[130px] ${fieldClass}`} />
          <Button tone="primary" type="submit" disabled={name.trim().length < 2}>
            <span className="flex items-center gap-1"><Plus size={13} /> Person</span>
          </Button>
        </form>
      )}
      {onLink && candidates && candidates.length > 0 && (
        <select value="" onChange={(e) => e.target.value && onLink(e.target.value)} aria-label="Link a contact" className={`w-full ${fieldClass}`}>
          <option value="">Link a contact to this deal…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.email ? ` · ${c.email}` : ""}
            </option>
          ))}
        </select>
      )}
      {people.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-[12px] text-white/40">No people linked yet.</div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {people.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.1] text-[11px] text-white">
                {c.name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((w) => w.charAt(0).toUpperCase())
                  .join("")}
              </span>
              <Link href={crmHref("contact", c.id)} className="min-w-0 flex-1 hover:underline hover:decoration-white/25 hover:underline-offset-2">
                <span className="block truncate text-[13px] text-white/90">{c.name}</span>
                <span className="block truncate text-[11px] text-white/50">{[c.title, c.email].filter(Boolean).join(" · ")}</span>
              </Link>
              {onUnlink && (
                <button onClick={() => onUnlink(c.id)} aria-label={`Unlink ${c.name}`} className="text-white/30 hover:text-red-300">
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
