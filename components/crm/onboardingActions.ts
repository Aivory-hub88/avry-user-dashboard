"use client"

/** Onboarding actions that call the CRM: load/remove sample data and run a CSV import. */
import { crmApi, type Activity, type Company, type Contact, type Deal } from "@/lib/crmClient"
import {
  dateInDays,
  dueInDays,
  isSample,
  SAMPLE_ACTIVITIES,
  SAMPLE_COMPANIES,
  SAMPLE_CONTACTS,
  SAMPLE_DEALS,
  sampleCustomFields,
  type ImportPlan,
} from "@/lib/crmOnboarding"

/** Runs `fn` over `items`, `limit` at a time; returns how many failed. */
async function pool<T>(items: T[], limit: number, fn: (t: T) => Promise<unknown>, onDone?: () => void): Promise<number> {
  let next = 0
  let failed = 0
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]
      try {
        await fn(item)
      } catch {
        failed++
      }
      onDone?.()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return failed
}

export async function loadSampleData(): Promise<void> {
  const cf = sampleCustomFields()
  const companyId = new Map<string, string>()
  for (const c of SAMPLE_COMPANIES) {
    const r = await crmApi.companies.create({ name: c.name, domain: c.domain, industry: c.industry, size: c.size, custom_fields: cf })
    companyId.set(c.key, r.id)
  }
  const contactId = new Map<string, string>()
  for (const p of SAMPLE_CONTACTS) {
    const r = await crmApi.contacts.create({ name: p.name, email: p.email, title: p.title, company_id: companyId.get(p.company), custom_fields: cf })
    contactId.set(p.key, r.id)
  }
  const dealId = new Map<string, string>()
  for (const d of SAMPLE_DEALS) {
    const r = await crmApi.deals.create({
      title: d.title,
      value: d.value,
      currency: "USD",
      stage: d.stage,
      company_id: companyId.get(d.company),
      contact_ids: d.contacts.map((k) => contactId.get(k) as string),
      expected_close_date: dateInDays(d.closeInDays),
      custom_fields: cf,
    })
    dealId.set(d.title, r.id)
  }
  for (const a of SAMPLE_ACTIVITIES) {
    await crmApi.activities.create({
      kind: a.kind,
      subject_type: "deal",
      subject_id: dealId.get(a.deal) as string,
      body: a.body,
      due_at: a.dueInDays === null ? null : dueInDays(a.dueInDays),
    })
  }
}

/** Deletes every sample record and the activities logged on them (activities are not removed with their record). */
export async function removeSampleData(d: { companies: Company[]; contacts: Contact[]; deals: Deal[]; activities: Activity[] }): Promise<number> {
  const ids = new Set([...d.companies, ...d.contacts, ...d.deals].filter(isSample).map((r) => r.id))
  let failed = await pool(d.activities.filter((a) => ids.has(a.subject_id)), 4, (a) => crmApi.activities.remove(a.id))
  failed += await pool(d.deals.filter(isSample), 4, (x) => crmApi.deals.remove(x.id))
  failed += await pool(d.contacts.filter(isSample), 4, (x) => crmApi.contacts.remove(x.id))
  failed += await pool(d.companies.filter(isSample), 4, (x) => crmApi.companies.remove(x.id))
  return failed
}

export type ImportResult = { companies: number; contacts: number; failed: number }

export async function runImport(plan: ImportPlan, existing: Company[], onProgress: (done: number, total: number) => void): Promise<ImportResult> {
  const total = plan.companies.length + plan.contacts.length
  let done = 0
  const tick = () => onProgress(++done, total)
  const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c.id]))
  let companies = 0
  let failed = await pool(plan.companies, 4, async (c) => {
    const r = await crmApi.companies.create({ name: c.name, domain: c.domain, industry: c.industry })
    byName.set(c.name.toLowerCase(), r.id)
    companies++
  }, tick)
  let contacts = 0
  failed += await pool(plan.contacts, 4, async (p) => {
    await crmApi.contacts.create({ name: p.name, email: p.email, phone: p.phone, title: p.title, company_id: p.company ? byName.get(p.company.toLowerCase()) : undefined })
    contacts++
  }, tick)
  return { companies, contacts, failed }
}
