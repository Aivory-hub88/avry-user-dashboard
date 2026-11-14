"use client"

/**
 * CRM home: Deals (pipeline board you drag deals across), Companies, Contacts
 * and Activity. Every name opens the record's own page (/crm/<type>/<id>).
 * Agent access lives behind the settings button, not in the tabs. Text lives
 * in span/div only — the dashboard's global `main h1-h4` / `main p` rules
 * would override Tailwind on UI chrome.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRightLeft, Clock, Plus, Search, SlidersHorizontal, Sparkles, Upload, X } from "lucide-react"
import { Button, fieldClass } from "@/components/requests/requestUi"
import AgentAccess from "@/components/crm/AgentAccess"
import ActivityFeed from "@/components/crm/ActivityFeed"
import CrmWelcome, { SetupChecklist } from "@/components/crm/CrmWelcome"
import ImportDialog from "@/components/crm/ImportDialog"
import { loadSampleData, removeSampleData } from "@/components/crm/onboardingActions"
import { CRM_TABS, STAGE_DOT, STAGE_LABEL, crmHref, type CrmTab } from "@/components/crm/crmUi"
import { activityState, agentLabel, formatWhen } from "@/lib/crmActivity"
import { crmApi, DEAL_STAGES, type Activity, type Company, type Contact, type Deal, type DealStage, type Grant } from "@/lib/crmClient"
import { agentRecent, isSample, setupChecklist, type ChecklistItem } from "@/lib/crmOnboarding"
import { daysUntil, formatMoney, isPastClose, OPEN_STAGES, pipelineSummary, sharedCurrency, stageTotals } from "@/lib/crmPipeline"

function ownerInitial(o: { owner_agent: string | null }): { label: string; title: string; agent: boolean } {
  if (!o.owner_agent) return { label: "You", title: "Owner: you", agent: false }
  const name = agentLabel(o.owner_agent).replace(/ \(agent\)$/, "")
  return { label: name.charAt(0).toUpperCase(), title: `Owner: ${name}`, agent: true }
}

const WELCOME_SKIPPED_KEY = "aivory.crm.welcomeSkipped"
const CHECKLIST_HIDDEN_KEY = "aivory.crm.checklistHidden"

/** Per-viewer UI preference; storage can be unavailable (private mode), so never throw. */
function readFlag(key: string): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(key) === "1"
  } catch {
    return false
  }
}

function writeFlag(key: string) {
  try {
    window.localStorage.setItem(key, "1")
  } catch {
    // Not persisted; the in-memory state still applies for this visit.
  }
}

function SamplePill() {
  return <span className="shrink-0 rounded-full bg-white/[0.08] px-1.5 py-px text-[10px] font-medium text-white/60">Sample</span>
}

function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso)
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

export default function CrmApp() {
  const router = useRouter()
  const params = useSearchParams()
  const fromUrl = params.get("tab") as CrmTab | null
  const tab: CrmTab = fromUrl && CRM_TABS.includes(fromUrl) ? fromUrl : "deals"
  const setTab = (t: CrmTab) => router.replace(crmHref(t), { scroll: false })

  const [companies, setCompanies] = useState<Company[] | null>(null)
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [deals, setDeals] = useState<Deal[] | null>(null)
  const [followUps, setFollowUps] = useState<Activity[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [grants, setGrants] = useState<Grant[] | null>(null)
  const [welcomeSkipped, setWelcomeSkipped] = useState(() => readFlag(WELCOME_SKIPPED_KEY))
  const [checklistHidden, setChecklistHidden] = useState(() => readFlag(CHECKLIST_HIDDEN_KEY))
  const [checklistOpen, setChecklistOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [sampleBusy, setSampleBusy] = useState<"load" | "remove" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [settingsOpen, setSettingsOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const [c, p, d, f, a, g] = await Promise.all([
        crmApi.companies.list(),
        crmApi.contacts.list(),
        crmApi.deals.list(),
        crmApi.activities.list({ has_due: true, completed: false }).catch(() => [] as Activity[]),
        crmApi.activities.list().catch(() => [] as Activity[]),
        crmApi.grants.list().catch(() => null),
      ])
      setCompanies(c)
      setContacts(p)
      setDeals(d)
      setFollowUps(f)
      setActivities(a)
      setGrants(g)
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
  const names = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of companies ?? []) m.set(`company:${c.id}`, c.name)
    for (const c of contacts ?? []) m.set(`contact:${c.id}`, c.name)
    for (const d of deals ?? []) m.set(`deal:${d.id}`, d.title)
    return m
  }, [companies, contacts, deals])

  /** Each deal's soonest open follow-up. */
  const nextStep = useMemo(() => {
    const m = new Map<string, Activity>()
    for (const a of followUps) {
      if (a.subject_type !== "deal" || !a.due_at) continue
      const cur = m.get(a.subject_id)
      if (!cur || new Date(a.due_at) < new Date(cur.due_at as string)) m.set(a.subject_id, a)
    }
    return m
  }, [followUps])
  const overdue = useMemo(() => followUps.filter((a) => activityState(a) === "overdue").length, [followUps])

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

  const moveDeal = async (id: string, stage: DealStage) => {
    const before = deals
    const cur = before?.find((d) => d.id === id)
    if (!before || !cur || cur.stage === stage) return
    setDeals(before.map((d) => (d.id === id ? { ...d, stage } : d)))
    setError(null)
    try {
      await crmApi.deals.setStage(id, stage)
    } catch (e) {
      setDeals(before)
      setError((e as Error).message)
    }
  }

  const TABS: { key: CrmTab; label: string; count?: number }[] = [
    { key: "deals", label: "Deals", count: deals?.length },
    { key: "companies", label: "Companies", count: companies?.length },
    { key: "contacts", label: "Contacts", count: contacts?.length },
    { key: "activity", label: "Activity" },
  ]
  const ready = companies !== null && contacts !== null && deals !== null
  const data = { companies: companies ?? [], contacts: contacts ?? [], deals: deals ?? [], activities }
  const checklist = setupChecklist({ ...data, grants })
  const setupDone = checklist.filter((i) => i.done).length
  const recent = agentRecent(data)
  const sampleCount = [...data.companies, ...data.contacts, ...data.deals].filter(isSample).length
  const empty = ready && data.companies.length + data.contacts.length + data.deals.length === 0
  const showWelcome = empty && !welcomeSkipped

  const skipWelcome = () => {
    setWelcomeSkipped(true)
    writeFlag(WELCOME_SKIPPED_KEY)
  }
  const hideChecklist = () => {
    setChecklistHidden(true)
    setChecklistOpen(false)
    writeFlag(CHECKLIST_HIDDEN_KEY)
  }
  const onChecklistItem = (key: ChecklistItem["key"]) => {
    setChecklistOpen(false)
    if (key === "agent") return setSettingsOpen(true)
    skipWelcome()
    if (key === "company") setTab("companies")
    else if (key === "contact") setTab("contacts")
    else if (key === "activity" && data.deals[0]) router.push(crmHref("deal", data.deals[0].id))
    else if (key === "activity" && data.companies[0]) router.push(crmHref("company", data.companies[0].id))
    else setTab("deals")
  }
  const addSample = async () => {
    setSampleBusy("load")
    setError(null)
    try {
      await loadSampleData()
    } catch (e) {
      setError(`Sample data could not be fully loaded: ${(e as Error).message}`)
    }
    await load()
    setSampleBusy(null)
  }
  const dropSample = async () => {
    setSampleBusy("remove")
    setError(null)
    const failed = await removeSampleData(data)
    if (failed) setError(`${failed} sample items could not be removed. Try again.`)
    await load()
    setSampleBusy(null)
  }

  return (
    <div className="flex h-full w-full flex-col bg-surface-1">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line bg-black/10 px-6 text-[13px]">
        <span className="font-medium text-white/85">CRM</span>
        <span className="flex items-center gap-1">
          {ready && !showWelcome && !checklistHidden && setupDone < checklist.length && (
            <span className="relative">
              <button
                type="button"
                onClick={() => setChecklistOpen((o) => !o)}
                aria-expanded={checklistOpen}
                className="flex items-center gap-2 whitespace-nowrap rounded-full border border-line bg-white/[0.04] py-1 pl-1.5 pr-3 text-[12px] text-white/75 hover:text-white"
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full"
                  style={{ background: `conic-gradient(#fff ${(setupDone / checklist.length) * 360}deg, rgba(255,255,255,.14) 0deg)` }}
                >
                  <span className="h-3.5 w-3.5 rounded-full bg-surface-1" />
                </span>
                Setup {setupDone} of {checklist.length}
              </button>
              {checklistOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setChecklistOpen(false)} aria-hidden />
                  <div className="absolute right-0 top-9 z-40 w-[300px] rounded-2xl border border-line bg-surface-1 p-4 shadow-2xl">
                    <SetupChecklist items={checklist} onItem={onChecklistItem} onHide={hideChecklist} />
                  </div>
                </>
              )}
            </span>
          )}
          {ready && !showWelcome && (
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] text-white/55 hover:bg-white/[0.06] hover:text-white/85"
            >
              <Upload className="h-3.5 w-3.5" />
              Import
            </button>
          )}
          <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] text-white/55 hover:bg-white/[0.06] hover:text-white/85"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Agent access
          </button>
        </span>
      </div>

      {showWelcome ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
          {error && <div className="mx-auto mb-4 max-w-[1040px] rounded-xl bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">{error}</div>}
          <CrmWelcome
            checklist={checklist}
            sampleBusy={sampleBusy === "load"}
            onConnect={() => setSettingsOpen(true)}
            onImport={() => setImportOpen(true)}
            onSample={() => void addSample()}
            onSkip={skipWelcome}
            onItem={onChecklistItem}
          />
        </div>
      ) : (
        <>

      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line px-6 py-3">
        <div className="flex flex-wrap gap-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors ${tab === t.key ? "bg-white/[0.1] text-white" : "text-white/55 hover:text-white/80"}`}
            >
              {t.label}
              {t.count !== undefined && <span className="ml-1.5 text-white/40">{t.count}</span>}
              {t.key === "activity" && overdue > 0 && <span className="ml-1.5 text-amber-300">{overdue} overdue</span>}
            </button>
          ))}
        </div>
        <label className={`ml-auto flex w-[220px] items-center gap-2 ${fieldClass} py-1.5`}>
          <Search className="h-3.5 w-3.5 shrink-0 text-white/40" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-white/30" />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {error && <div className="mb-4 rounded-xl bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">{error}</div>}
        {ready && sampleCount > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white/[0.03] px-4 py-2.5">
            <SamplePill />
            <span className="min-w-[200px] flex-1 text-[13px] text-white/75">You&apos;re looking at sample data. Records you add yourself stay when you remove it.</span>
            <Button onClick={() => void dropSample()} disabled={sampleBusy !== null}>
              {sampleBusy === "remove" ? "Removing…" : "Remove sample data"}
            </Button>
          </div>
        )}
        {ready && recent.records + recent.activities > 0 && tab !== "activity" && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-sky-400/15 bg-sky-400/[0.06] px-4 py-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-400/20 text-sky-100">
              <Sparkles size={12} />
            </span>
            <span className="min-w-[200px] flex-1 text-[13px] text-white/80">
              {recent.agents.map((a) => agentLabel(a).replace(/ \(agent\)$/, "")).join(" and ")}{" "}
              {[
                recent.records ? `added ${recent.records} ${recent.records === 1 ? "record" : "records"}` : "",
                recent.activities ? `logged ${recent.activities} ${recent.activities === 1 ? "activity" : "activities"}` : "",
              ]
                .filter(Boolean)
                .join(" and ")}{" "}
              in the last 24 hours.
            </span>
            <Button onClick={() => setTab("activity")}>Review</Button>
          </div>
        )}

        {!ready ? (
          !error && <div className="h-40 animate-pulse rounded-2xl bg-white/[0.03]" />
        ) : tab === "activity" ? (
          <ActivityFeed names={names} query={q} version={0} onOpen={(s) => router.push(crmHref(s.type, s.id))} onError={setError} />
        ) : tab === "deals" ? (
          <DealsTab
            deals={deals.filter((d) => hit(d.title, companyName.get(d.company_id ?? "")))}
            allDeals={deals}
            companies={companies}
            companyName={companyName}
            nextStep={nextStep}
            overdue={overdue}
            onCreate={(b) => run(() => crmApi.deals.create(b))}
            onMove={moveDeal}
            onShowActivity={() => setTab("activity")}
          />
        ) : tab === "companies" ? (
          <CompaniesTab
            companies={companies.filter((c) => hit(c.name, c.domain, c.industry))}
            contacts={contacts}
            deals={deals}
            onCreate={(b) => run(() => crmApi.companies.create(b))}
          />
        ) : (
          <ContactsTab
            contacts={contacts.filter((c) => hit(c.name, c.email, c.title, companyName.get(c.company_id ?? "")))}
            companies={companies}
            companyName={companyName}
            onCreate={(b) => run(() => crmApi.contacts.create(b))}
          />
        )}
      </div>

        </>
      )}

      {settingsOpen && (
        <AgentDrawer
          onClose={() => {
            setSettingsOpen(false)
            void load()
          }}
        />
      )}
      {importOpen && companies && <ImportDialog companies={companies} onClose={() => setImportOpen(false)} onImported={() => void load()} />}
    </div>
  )
}

function AgentDrawer({ onClose }: { onClose: () => void }) {
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <aside role="dialog" aria-modal="true" aria-label="Agent access" className="absolute right-0 top-0 flex h-full w-full max-w-[640px] flex-col border-l border-line bg-surface-1 shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <span className="text-[15px] font-medium text-white/90">Agent access</span>
          <button onClick={onClose} aria-label="Close" className="text-white/45 hover:text-white/85">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {error && <div className="mb-4 rounded-xl bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">{error}</div>}
          <AgentAccess onError={setError} />
        </div>
      </aside>
    </div>
  )
}

function Stat({ label, value, sub, tone, onClick }: { label: string; value: string; sub: string; tone?: "warn"; onClick?: () => void }) {
  const cls = `flex flex-col gap-1 rounded-2xl border px-4 py-3.5 text-left ${tone === "warn" ? "border-amber-400/25 bg-amber-500/[0.06]" : "border-line"}`
  const body = (
    <>
      <span className={`text-[12px] ${tone === "warn" ? "text-amber-200" : "text-white/55"}`}>{label}</span>
      <span className="text-[20px] font-light text-white">{value}</span>
      <span className={`truncate text-[11px] ${tone === "warn" ? "text-amber-100/70" : "text-white/45"}`}>{sub}</span>
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} transition-colors hover:bg-amber-500/[0.1]`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

function DealsTab({
  deals,
  allDeals,
  companies,
  companyName,
  nextStep,
  overdue,
  onCreate,
  onMove,
  onShowActivity,
}: {
  deals: Deal[]
  allDeals: Deal[]
  companies: Company[]
  companyName: Map<string, string>
  nextStep: Map<string, Activity>
  overdue: number
  onCreate: (b: { title: string; value?: number; company_id?: string; expected_close_date?: string }) => void
  onMove: (id: string, s: DealStage) => void
  onShowActivity: () => void
}) {
  const [title, setTitle] = useState("")
  const [value, setValue] = useState("")
  const [companyId, setCompanyId] = useState("")
  const [close, setClose] = useState("")
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<DealStage | null>(null)
  const parsed = value.trim() === "" ? undefined : Number(value)
  const invalid = title.trim().length < 2 || (parsed !== undefined && !Number.isInteger(parsed))

  const summary = pipelineSummary(allDeals)
  const cur = sharedCurrency(allDeals)
  const totals = stageTotals(deals)
  const pastClose = allDeals.filter((d) => isPastClose(d)).length

  return (
    <div className="space-y-5">
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        <Stat label="Open pipeline" value={formatMoney(summary.openValue, cur)} sub={`${summary.openCount} deals in Lead, Qualified, Proposal`} />
        <Stat label="Weighted forecast" value={formatMoney(summary.weighted, cur)} sub="Lead 10% · Qualified 40% · Proposal 70%" />
        <Stat label="Won" value={formatMoney(summary.wonValue, cur)} sub={summary.wonCount === 1 ? "1 deal" : `${summary.wonCount} deals`} />
        {overdue + pastClose > 0 ? (
          <Stat
            label="Needs you"
            value={String(overdue + pastClose)}
            sub={[overdue ? `${overdue} overdue follow-up${overdue === 1 ? "" : "s"}` : "", pastClose ? `${pastClose} past close date` : ""].filter(Boolean).join(" · ")}
            tone="warn"
            onClick={overdue ? onShowActivity : undefined}
          />
        ) : (
          <Stat label="Needs you" value="0" sub="Nothing overdue" />
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (invalid) return
          onCreate({ title: title.trim(), value: parsed, company_id: companyId || undefined, expected_close_date: close || undefined })
          setTitle("")
          setValue("")
          setCompanyId("")
          setClose("")
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New deal title" aria-label="Deal title" className={`w-[240px] ${fieldClass}`} />
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" inputMode="numeric" aria-label="Deal value" className={`w-[110px] ${fieldClass}`} />
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="Company" className={`w-[180px] ${fieldClass}`}>
          <option value="">No company</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input type="date" value={close} onChange={(e) => setClose(e.target.value)} aria-label="Expected close date" title="Expected close date" className={`w-[150px] ${fieldClass} [color-scheme:dark]`} />
        <Button tone="primary" type="submit" disabled={invalid}>
          <span className="flex items-center gap-1"><Plus size={13} /> Add deal</span>
        </Button>
      </form>

      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[1080px] grid-cols-5 gap-3">
          {DEAL_STAGES.map((stage) => {
            const col = deals.filter((d) => d.stage === stage)
            const isOver = over === stage && dragId !== null && deals.find((d) => d.id === dragId)?.stage !== stage
            return (
              <section
                key={stage}
                aria-label={STAGE_LABEL[stage]}
                onDragOver={(e) => {
                  if (!dragId) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = "move"
                  if (over !== stage) setOver(stage)
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === stage ? null : o))
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const id = e.dataTransfer.getData("text/x-crm-deal") || dragId
                  if (id) onMove(id, stage)
                  setDragId(null)
                  setOver(null)
                }}
                className={`flex min-w-0 flex-col gap-2 rounded-2xl p-3 transition-colors ${isOver ? "bg-white/[0.06] ring-1 ring-white/20" : "bg-white/[0.025]"}`}
              >
                <div className="mb-1 flex items-center gap-2 px-1">
                  <span className={`h-2 w-2 rounded-full ${STAGE_DOT[stage]}`} />
                  <span className="text-[12px] font-medium text-white/85">{STAGE_LABEL[stage]}</span>
                  <span className="text-[11px] text-white/45">{totals[stage].count}</span>
                  {totals[stage].value > 0 && <span className="ml-auto text-[11px] text-white/55">{formatMoney(totals[stage].value, cur)}</span>}
                </div>
                {col.map((d) => (
                  <DealCard
                    key={d.id}
                    d={d}
                    company={companyName.get(d.company_id ?? "")}
                    next={nextStep.get(d.id)}
                    dragging={dragId === d.id}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/x-crm-deal", d.id)
                      e.dataTransfer.effectAllowed = "move"
                      setDragId(d.id)
                    }}
                    onDragEnd={() => {
                      setDragId(null)
                      setOver(null)
                    }}
                    onMove={(s) => onMove(d.id, s)}
                  />
                ))}
                {isOver && <div className="flex h-16 items-center justify-center rounded-xl border border-dashed border-white/25 text-[11px] text-white/55">Drop to move to {STAGE_LABEL[stage]}</div>}
                {col.length === 0 && !isOver && <div className="px-1 py-3 text-[11px] text-white/35">{OPEN_STAGES.includes(stage) ? "Drag a deal here" : "No deals"}</div>}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function DealCard({
  d,
  company,
  next,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  d: Deal
  company: string | undefined
  next: Activity | undefined
  dragging: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onMove: (s: DealStage) => void
}) {
  const owner = ownerInitial(d)
  const late = isPastClose(d)
  const days = daysUntil(d.expected_close_date)
  const nextState = next ? activityState(next) : null
  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group cursor-grab rounded-xl border bg-white/[0.045] p-3 transition-[opacity,border-color] active:cursor-grabbing ${dragging ? "border-white/30 opacity-40" : "border-line hover:border-white/15"}`}
    >
      <div className="flex items-start gap-2">
        <Link href={crmHref("deal", d.id)} draggable={false} className="min-w-0 flex-1 break-words text-[13px] font-medium text-white/90 hover:underline hover:decoration-white/25 hover:underline-offset-2">
          {d.title}
        </Link>
        <span
          title={owner.title}
          className={`flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold ${owner.agent ? "bg-sky-400/20 text-sky-100" : "bg-white/[0.12] text-white/80"}`}
        >
          {owner.label}
        </span>
      </div>
      {(company || isSample(d)) && (
        <div className="mt-0.5 flex items-center gap-1.5">
          {company && <span className="truncate text-[11px] text-white/55">{company}</span>}
          {isSample(d) && <SamplePill />}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
        <span className="text-white/85">{d.value !== null ? formatMoney(d.value, d.currency) : <span className="text-white/35">No value</span>}</span>
        {d.expected_close_date && (
          <span className={`text-[11px] ${late ? "text-amber-300" : "text-white/50"}`} title="Expected close date">
            {late ? `${-(days ?? 0)} d late` : shortDate(d.expected_close_date)}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
        <span className={`flex min-w-0 flex-1 items-center gap-1.5 truncate text-[11px] ${nextState === "overdue" ? "text-amber-300" : next ? "text-white/60" : "text-white/35"}`}>
          <Clock size={11} className="shrink-0" />
          <span className="truncate">{next ? `${nextState === "overdue" ? "Overdue" : "Next"} ${formatWhen(next.due_at as string)}${next.body ? ` · ${next.body}` : ""}` : "No next step"}</span>
        </span>
        {/* Keyboard/touch alternative to dragging: an invisible select over a small icon. */}
        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/35 hover:bg-white/[0.06] hover:text-white/80 focus-within:bg-white/[0.08] focus-within:text-white/85" title="Move to stage">
          <ArrowRightLeft size={12} aria-hidden />
          <select
            value={d.stage}
            onChange={(e) => onMove(e.target.value as DealStage)}
            aria-label={`Move ${d.title} to stage`}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {DEAL_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </span>
      </div>
    </article>
  )
}

function CompaniesTab({
  companies,
  contacts,
  deals,
  onCreate,
}: {
  companies: Company[]
  contacts: Contact[]
  deals: Deal[]
  onCreate: (b: { name: string; domain?: string; industry?: string }) => void
}) {
  const [name, setName] = useState("")
  const [domain, setDomain] = useState("")
  const [industry, setIndustry] = useState("")
  const people = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of contacts) if (c.company_id) m.set(c.company_id, (m.get(c.company_id) ?? 0) + 1)
    return m
  }, [contacts])
  const open = useMemo(() => {
    const m = new Map<string, Deal[]>()
    for (const d of deals) if (d.company_id && OPEN_STAGES.includes(d.stage)) m.set(d.company_id, [...(m.get(d.company_id) ?? []), d])
    return m
  }, [deals])
  return (
    <div className="mx-auto max-w-[1000px] space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim().length < 2) return
          onCreate({ name: name.trim(), domain, industry })
          setName("")
          setDomain("")
          setIndustry("")
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name" aria-label="Company name" className={`w-[220px] ${fieldClass}`} />
        <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="domain.com" aria-label="Domain" className={`w-[180px] ${fieldClass}`} />
        <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Industry" aria-label="Industry" className={`w-[160px] ${fieldClass}`} />
        <Button tone="primary" type="submit" disabled={name.trim().length < 2}>
          <span className="flex items-center gap-1"><Plus size={13} /> Add company</span>
        </Button>
      </form>
      {companies.length === 0 ? (
        <Empty>No companies yet. Add one above, or let an agent like Lex add them as it qualifies leads.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="text-[11px] text-white/50">
              <tr className="border-b border-line">
                <th className="px-4 py-2.5 font-normal">Company</th>
                <th className="px-4 py-2.5 font-normal">Industry</th>
                <th className="px-4 py-2.5 font-normal">People</th>
                <th className="px-4 py-2.5 font-normal">Open deals</th>
                <th className="px-4 py-2.5 font-normal">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {companies.map((c) => {
                const od = open.get(c.id) ?? []
                const sum = od.reduce((n, d) => n + (d.value ?? 0), 0)
                return (
                  <tr key={c.id} className="hover:bg-white/[0.025]">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <Link href={crmHref("company", c.id)} className="text-white/90 hover:underline hover:decoration-white/25 hover:underline-offset-2">{c.name}</Link>
                        {isSample(c) && <SamplePill />}
                      </span>
                      {c.domain && <span className="block text-[11px] text-white/45">{c.domain}</span>}
                    </td>
                    <td className="px-4 py-3 text-white/65">{c.industry ?? <span className="text-white/25">—</span>}</td>
                    <td className="px-4 py-3 text-white/65">{people.get(c.id) ?? 0}</td>
                    <td className="px-4 py-3 text-white/65">{od.length ? `${od.length} · ${formatMoney(sum, sharedCurrency(od))}` : <span className="text-white/25">—</span>}</td>
                    <td className="px-4 py-3 text-white/65">{c.owner_agent ? agentLabel(c.owner_agent) : "You"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ContactsTab({
  contacts,
  companies,
  companyName,
  onCreate,
}: {
  contacts: Contact[]
  companies: Company[]
  companyName: Map<string, string>
  onCreate: (b: { name: string; email?: string; phone?: string; title?: string; company_id?: string }) => void
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [title, setTitle] = useState("")
  const [companyId, setCompanyId] = useState("")
  return (
    <div className="mx-auto max-w-[1000px] space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim().length < 2) return
          onCreate({ name: name.trim(), email, title, company_id: companyId || undefined })
          setName("")
          setEmail("")
          setTitle("")
          setCompanyId("")
        }}
        className="flex flex-wrap items-center gap-2"
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
        <Button tone="primary" type="submit" disabled={name.trim().length < 2}>
          <span className="flex items-center gap-1"><Plus size={13} /> Add contact</span>
        </Button>
      </form>
      {contacts.length === 0 ? (
        <Empty>No contacts yet.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="text-[11px] text-white/50">
              <tr className="border-b border-line">
                <th className="px-4 py-2.5 font-normal">Name</th>
                <th className="px-4 py-2.5 font-normal">Company</th>
                <th className="px-4 py-2.5 font-normal">Email</th>
                <th className="px-4 py-2.5 font-normal">Phone</th>
                <th className="px-4 py-2.5 font-normal">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-white/[0.025]">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <Link href={crmHref("contact", c.id)} className="text-white/90 hover:underline hover:decoration-white/25 hover:underline-offset-2">{c.name}</Link>
                      {isSample(c) && <SamplePill />}
                    </span>
                    {c.title && <span className="block text-[11px] text-white/45">{c.title}</span>}
                  </td>
                  <td className="px-4 py-3 text-white/65">
                    {c.company_id && companyName.has(c.company_id) ? (
                      <Link href={crmHref("company", c.company_id)} className="hover:text-white/90">{companyName.get(c.company_id)}</Link>
                    ) : (
                      <span className="text-white/25">—</span>
                    )}
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-white/65">{c.email ?? <span className="text-white/25">—</span>}</td>
                  <td className="px-4 py-3 text-white/65">{c.phone ?? <span className="text-white/25">—</span>}</td>
                  <td className="px-4 py-3 text-white/65">{c.owner_agent ? agentLabel(c.owner_agent) : "You"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line px-5 py-10 text-center text-[12px] text-white/40">{children}</div>
}
