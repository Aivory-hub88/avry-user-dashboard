/** Server-side template lookup with a short cache, shared by the list and send routes. SERVER-ONLY. */
import type { Provider } from '@/lib/whatsapp/providers'
import type { Creds, TemplateList } from '@/lib/whatsapp/types'

const TTL_MS = 60_000
const g = globalThis as unknown as { __waTplCache?: Map<string, { at: number; v: TemplateList }> }
const cache = (g.__waTplCache ??= new Map())

export async function listTemplates(key: string, provider: Provider, creds: Creds): Promise<TemplateList> {
  if (!provider.templates) return { ok: false, code: 'unsupported', message: 'Templates are not supported for this WhatsApp provider here yet. Send them from the provider’s own console.' }
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v
  const v = await provider.templates.list(creds)
  if (v.ok) cache.set(key, { at: Date.now(), v })
  return v
}
