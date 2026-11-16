/**
 * Server-side CRM access for routes that act on a tenant without a browser
 * session in the loop (the WhatsApp webhook) or that need the CRM from the
 * server (send). Same auth as app/api/crm: shared service token + tenant id.
 * SERVER-ONLY.
 */
import { collectPages, NEXT_CURSOR_HEADER, pageQuery } from '@/lib/crmPaging'
import type { ContactRow, CrmPort } from '@/lib/whatsappInbound'

export type CrmContact = ContactRow & { email: string | null }

async function call<T>(tenantId: string, path: string, init?: { method?: string; json?: unknown }): Promise<{ data: T; next: string | null }> {
  const token = process.env.CRM_SERVICE_TOKEN
  if (!token) throw new Error('crm_not_configured')
  const base = process.env.CRM_URL || 'http://avry-crm:8091'
  const r = await fetch(`${base}/${path}`, {
    method: init?.method ?? 'GET',
    headers: { 'content-type': 'application/json', 'x-service-token': token, 'x-tenant-id': tenantId },
    body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
    signal: AbortSignal.timeout(10_000),
  })
  if (!r.ok) throw new Error(`crm_${r.status}`)
  const text = await r.text()
  return { data: (text ? JSON.parse(text) : {}) as T, next: r.headers.get(NEXT_CURSOR_HEADER) }
}

export type CrmNote = { kind: string; body: string | null; occurred_at: string }

export function crmFor(tenantId: string): CrmPort & { getContact(id: string): Promise<CrmContact | null>; listContactActivities(contactId: string): Promise<CrmNote[]> } {
  return {
    listContacts: () => collectPages((cursor) => call<CrmContact[]>(tenantId, `contacts?${pageQuery(undefined, cursor)}`)),
    createContact: async (b) => (await call<CrmContact>(tenantId, 'contacts', { method: 'POST', json: b })).data,
    createActivity: async (b) => (await call(tenantId, 'activities', { method: 'POST', json: b })).data,
    listContactActivities: async (contactId) => (await call<CrmNote[]>(tenantId, `activities?subject_type=contact&subject_id=${encodeURIComponent(contactId)}&limit=50`)).data,
    getContact: async (id) => {
      try {
        return (await call<CrmContact>(tenantId, `contacts/${encodeURIComponent(id)}`)).data
      } catch (e) {
        if ((e as Error).message === 'crm_404' || (e as Error).message === 'crm_400') return null
        throw e
      }
    },
  }
}
