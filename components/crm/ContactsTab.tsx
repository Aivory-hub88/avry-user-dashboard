"use client"

/**
 * Contacts: add form (with duplicate check), smart + saved views, label filter,
 * and a sortable table with phone/WhatsApp links, last contact and next step.
 * Text lives in span/div only (the dashboard's global `main h1-h4` / `main p`
 * rules would override Tailwind on UI chrome).
 */
import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, Bookmark, Clock, MessageCircle, Phone, X } from "lucide-react"
import { fieldClass } from "@/components/requests/requestUi"
import { AddButton, AddNoteLine, useAddForm } from "@/components/crm/AddForm"
import { Empty, SamplePill } from "@/components/crm/CrmBits"
import { LabelEditor, LabelList, LabelPill } from "@/components/crm/Labels"
import { crmHref } from "@/components/crm/crmUi"
import { activityState, agentLabel, formatWhen } from "@/lib/crmActivity"
import type { Activity, Company, Contact } from "@/lib/crmClient"
import {
  contactedLabel,
  type ContactFacts,
  contactNextStep,
  daysSince,
  findDuplicate,
  lastContactMap,
  matchesView,
  MAX_SAVED_VIEWS,
  parseSavedViews,
  SMART_VIEWS,
  type SavedView,
  type SmartView,
} from "@/lib/crmContacts"
import { cleanPhone, getLabels, getSource, hasLabel, isPlausiblePhone, labelCounts, SOURCES, telHref, whatsappHref, withLabels, withSource } from "@/lib/crmLabels"
import { isSample } from "@/lib/crmOnboarding"

const VIEWS_KEY = "aivory.crm.contactViews"
type SortKey = "name" | "last" | "next"
type Sort = { key: SortKey; dir: "asc" | "desc" } | null

/** Saved views are a per-viewer convenience; storage can be unavailable, so never throw. */
function readViews(): SavedView[] {
  try {
    return typeof window === "undefined" ? [] : parseSavedViews(window.localStorage.getItem(VIEWS_KEY))
  } catch {
    return []
  }
}
function writeViews(v: SavedView[]) {
  try {
    window.localStorage.setItem(VIEWS_KEY, JSON.stringify(v))
  } catch {
    // Not persisted; the in-memory list still applies for this visit.
  }
}

export default function ContactsTab({
  contacts,
  allContacts,
  activities,
  followUps,
  companies,
  companyName,
  knownLabels,
  whatsappConnected,
  onCreate,
}: {
  /** Already narrowed by the page search. */
  contacts: Contact[]
  /** Everyone, for duplicate checks and label counts. */
  allContacts: Contact[]
  activities: Activity[]
  followUps: Activity[]
  companies: Company[]
  companyName: Map<string, string>
  knownLabels: string[]
  /** When true the chat icon opens the contact page (send from the connected number) instead of the person's own WhatsApp app. */
  whatsappConnected: boolean
  onCreate: (b: { name: string; email?: string; phone?: string; title?: string; company_id?: string; custom_fields?: Record<string, unknown> }) => Promise<boolean>
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [title, setTitle] = useState("")
  const [companyId, setCompanyId] = useState("")
  const [source, setSource] = useState("")
  const [labels, setLabels] = useState<string[]>([])
  const [dupe, setDupe] = useState<{ id: string; name: string; by: "email" | "phone" } | null>(null)
  const [view, setView] = useState<SmartView>("all")
  const [label, setLabel] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>(null)
  const [saved, setSaved] = useState<SavedView[]>([])
  const [naming, setNaming] = useState<string | null>(null)
  const form = useAddForm()
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Read once on mount (localStorage is not available during SSR).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(readViews())
  }, [])

  const contactLabels = useMemo(() => labelCounts(allContacts), [allContacts])
  const lastContact = useMemo(() => lastContactMap(activities), [activities])
  const nextStep = useMemo(() => contactNextStep(followUps), [followUps])

  const rows = useMemo(() => {
    const facts = (c: Contact): ContactFacts => {
      const state = nextStep.get(c.id) ? activityState(nextStep.get(c.id) as Activity) : "none"
      return { lastContactDays: daysSince(lastContact.get(c.id)), nextDueState: state === "done" ? "none" : state }
    }
    const out = contacts.filter((c) => (label ? hasLabel(c.custom_fields, label) : true)).filter((c) => matchesView(view, facts(c)))
    if (!sort) return out
    const dir = sort.dir === "asc" ? 1 : -1
    const key = (c: Contact): string | number => {
      if (sort.key === "name") return c.name.toLowerCase()
      if (sort.key === "last") return lastContact.has(c.id) ? new Date(lastContact.get(c.id) as string).getTime() : -Infinity
      const n = nextStep.get(c.id)
      return n?.due_at ? new Date(n.due_at).getTime() : Infinity
    }
    return [...out].sort((a, b) => {
      const x = key(a)
      const y = key(b)
      if (x === y) return 0
      return (x < y ? -1 : 1) * dir
    })
  }, [contacts, label, view, sort, lastContact, nextStep])

  const toggleSort = (key: SortKey) =>
    setSort((s) => (!s || s.key !== key ? { key, dir: key === "last" ? "desc" : "asc" } : s.dir === (key === "last" ? "desc" : "asc") ? { key, dir: key === "last" ? "asc" : "desc" } : null))

  const filtered = view !== "all" || label !== null
  const matchesSaved = saved.find((s) => s.view === view && s.label === label)
  const saveView = (n: string) => {
    const nm = n.trim().slice(0, 28)
    if (!nm || saved.length >= MAX_SAVED_VIEWS) return setNaming(null)
    const next = [...saved, { id: `${Date.now()}`, name: nm, view, label }]
    setSaved(next)
    writeViews(next)
    setNaming(null)
  }
  const dropView = (id: string) => {
    const next = saved.filter((s) => s.id !== id)
    setSaved(next)
    writeViews(next)
  }

  const head = (key: SortKey, text: string) => (
    <th className="px-4 py-2.5 font-normal" aria-sort={sort?.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-white/80">
        {text}
        {sort?.key === key && (sort.dir === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
      </button>
    </th>
  )

  const create = (ignoreDupe: boolean) => {
    const badName = name.trim().length < 2
    const badEmail = email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    const badPhone = phone.trim() !== "" && !isPlausiblePhone(phone)
    const dup = ignoreDupe || badName || badEmail || badPhone ? null : findDuplicate(allContacts, { email, phone })
    if (dup) {
      setDupe({ id: dup.contact.id, name: dup.contact.name, by: dup.by })
      return
    }
    setDupe(null)
    void form.submit({
      problem: badName ? "Enter the contact’s name first." : badEmail ? "That email doesn’t look right." : badPhone ? "That phone number doesn’t look right. Use digits, like 0812 3456 7890 or +62 812 3456 7890." : null,
      focus: badName ? nameRef.current : badEmail ? emailRef.current : phoneRef.current,
      create: () => onCreate({ name: name.trim(), email: email.trim(), phone: cleanPhone(phone), title: title.trim(), company_id: companyId || undefined, custom_fields: withSource(withLabels({}, labels), source) }),
      added: `Added ${name.trim()}.`,
      reset: () => {
        setName("")
        setEmail("")
        setPhone("")
        setTitle("")
        setCompanyId("")
        setSource("")
        setLabels([])
      },
    })
  }

  const chip = (active: boolean) => `rounded-full px-2.5 py-0.5 text-[11px] transition-colors ${active ? "bg-white/[0.18] text-white" : "bg-white/[0.07] text-white/65 hover:bg-white/[0.12]"}`

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          create(false)
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input ref={nameRef} value={name} onChange={(e) => { setName(e.target.value); form.clearHint() }} placeholder="Full name" aria-label="Full name" className={`w-[170px] ${fieldClass}`} />
        <input ref={emailRef} type="email" value={email} onChange={(e) => { setEmail(e.target.value); setDupe(null); form.clearHint() }} placeholder="Email" aria-label="Email" className={`w-[200px] ${fieldClass}`} />
        <input ref={phoneRef} type="tel" inputMode="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setDupe(null); form.clearHint() }} placeholder="Phone / WhatsApp" aria-label="Phone" className={`w-[160px] ${fieldClass}`} />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" className={`w-[130px] ${fieldClass}`} />
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="Company" className={`w-[160px] ${fieldClass}`}>
          <option value="">No company</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Lead source" className={`w-[140px] ${fieldClass} ${source ? "" : "text-white/35"}`}>
          <option value="">Lead source</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className={`flex min-h-[38px] min-w-[170px] items-center ${fieldClass} py-1`}>
          <LabelEditor labels={labels} known={knownLabels} onChange={setLabels} compact />
        </span>
        <AddButton saving={form.saving} label="Add contact" />
        <AddNoteLine note={form.note} />
        {dupe && (
          <div role="alert" className="flex basis-full flex-wrap items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-500/[0.07] px-4 py-2.5 text-[12px] text-amber-100/90">
            <span className="min-w-[200px] flex-1">
              <Link href={crmHref("contact", dupe.id)} className="font-medium underline decoration-amber-200/30 underline-offset-2">{dupe.name}</Link> already has this {dupe.by === "email" ? "email" : "phone number"}.
            </span>
            <button type="button" onClick={() => create(true)} className="rounded-full border border-amber-200/25 px-3 py-1 hover:bg-amber-200/10">
              Add anyway
            </button>
            <button type="button" onClick={() => setDupe(null)} className="text-amber-100/60 hover:text-amber-100">
              Cancel
            </button>
          </div>
        )}
      </form>

      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Views">
          <span className="mr-1 text-[11px] text-white/40">View</span>
          {SMART_VIEWS.map((v) => (
            <button key={v.key} type="button" title={v.hint} aria-pressed={view === v.key} onClick={() => setView(v.key)} className={chip(view === v.key)}>
              {v.label}
            </button>
          ))}
          {saved.map((s) => (
            <span key={s.id} className={`inline-flex items-center gap-1 pr-1 ${chip(view === s.view && label === s.label)}`}>
              <button type="button" onClick={() => { setView(s.view); setLabel(s.label) }} className="inline-flex items-center gap-1 pl-0.5">
                <Bookmark size={10} />
                {s.name}
              </button>
              <button type="button" onClick={() => dropView(s.id)} aria-label={`Delete saved view ${s.name}`} className="rounded-full p-0.5 text-white/40 hover:text-white/90">
                <X size={10} />
              </button>
            </span>
          ))}
          {filtered && !matchesSaved && saved.length < MAX_SAVED_VIEWS &&
            (naming === null ? (
              <button type="button" onClick={() => setNaming("")} className="rounded-full border border-dashed border-white/20 px-2.5 py-0.5 text-[11px] text-white/55 hover:text-white/90">
                Save this view
              </button>
            ) : (
              <input
                autoFocus
                value={naming}
                onChange={(e) => setNaming(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveView(naming)
                  else if (e.key === "Escape") setNaming(null)
                }}
                onBlur={() => setNaming(null)}
                placeholder="Name it, press Enter"
                aria-label="Saved view name"
                maxLength={28}
                className={`w-[170px] ${fieldClass} py-0.5 text-[11px]`}
              />
            ))}
        </div>
        {contactLabels.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by label">
            <span className="mr-1 text-[11px] text-white/40">Label</span>
            <button type="button" onClick={() => setLabel(null)} aria-pressed={label === null} className={chip(label === null)}>
              Any
            </button>
            {contactLabels.map(({ label: l, count }) => (
              <span key={l} className="inline-flex items-center gap-1">
                <LabelPill label={l} active={label?.toLowerCase() === l.toLowerCase()} onClick={() => setLabel(label?.toLowerCase() === l.toLowerCase() ? null : l)} />
                <span className="text-[10px] text-white/35">{count}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {allContacts.length === 0 ? (
        <Empty>No contacts yet.</Empty>
      ) : rows.length === 0 ? (
        <Empty>{filtered ? "Nobody matches this view." : "No contacts match your search."}</Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[1040px] text-left text-[13px]">
            <thead className="text-[11px] text-white/50">
              <tr className="border-b border-line">
                {head("name", "Name")}
                <th className="px-4 py-2.5 font-normal">Company</th>
                <th className="px-4 py-2.5 font-normal">Email</th>
                <th className="px-4 py-2.5 font-normal">Phone</th>
                <th className="px-4 py-2.5 font-normal">Labels</th>
                {head("last", "Last contact")}
                {head("next", "Next step")}
                <th className="px-4 py-2.5 font-normal">Source</th>
                <th className="px-4 py-2.5 font-normal">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => {
                const tel = telHref(c.phone)
                const wa = whatsappHref(c.phone)
                const last = lastContact.get(c.id)
                const days = daysSince(last)
                const next = nextStep.get(c.id)
                const nextState = next ? activityState(next) : null
                return (
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
                    <td className="max-w-[200px] truncate px-4 py-3 text-white/65">
                      {c.email ? <a href={`mailto:${c.email}`} className="hover:text-white/90">{c.email}</a> : <span className="text-white/25">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-white/65">
                      {c.phone ? (
                        <span className="flex items-center gap-2">
                          {tel ? <a href={tel} className="hover:text-white/90">{c.phone}</a> : c.phone}
                          {wa &&
                            (whatsappConnected ? (
                              <Link href={crmHref("contact", c.id)} aria-label={`Message ${c.name} on WhatsApp`} title="Message on WhatsApp (opens the contact)" className="text-white/35 hover:text-emerald-300">
                                <MessageCircle size={13} />
                              </Link>
                            ) : (
                              <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${c.name}`} title="Open in your WhatsApp app" className="text-white/35 hover:text-emerald-300">
                                <MessageCircle size={13} />
                              </a>
                            ))}
                          {tel && (
                            <a href={tel} aria-label={`Call ${c.name}`} title="Call" className="text-white/35 hover:text-white/85">
                              <Phone size={12} />
                            </a>
                          )}
                        </span>
                      ) : (
                        <span className="text-white/25">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><LabelList labels={getLabels(c.custom_fields)} /></td>
                    <td className={`whitespace-nowrap px-4 py-3 ${days === null || days >= 7 ? "text-amber-300/80" : "text-white/65"}`} title={last ? formatWhen(last) : "No call, email or meeting logged"}>
                      {contactedLabel(days)}
                    </td>
                    <td className="max-w-[200px] px-4 py-3">
                      {next ? (
                        <span className={`flex items-center gap-1.5 text-[12px] ${nextState === "overdue" ? "text-amber-300" : "text-white/65"}`} title={next.body ?? undefined}>
                          <Clock size={11} className="shrink-0" />
                          <span className="truncate">{nextState === "overdue" ? "Overdue " : ""}{formatWhen(next.due_at as string)}</span>
                        </span>
                      ) : (
                        <span className="text-white/25">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-white/65">{getSource(c.custom_fields) || <span className="text-white/25">—</span>}</td>
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
