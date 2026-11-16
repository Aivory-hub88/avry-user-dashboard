/**
 * One-shot call to the Aivory assistant through the VPS bridge (the same path the in-app assistant
 * uses). The bridge answers with an SSE stream; for these short replies it is a single full-text
 * `chunk` followed by `done`. SERVER-ONLY.
 */
import type { ChatTurn } from './whatsappDraftPrompt'

export function lastChunkText(sse: string): string | null {
  let text: string | null = null
  for (const line of sse.split('\n')) {
    if (!line.startsWith('data: ')) continue
    const data = line.slice(6)
    try {
      const j = JSON.parse(data) as { type?: string; content?: string; error?: string }
      if (j.type === 'error') return null
      // Chunks carry the text so far; the last non-empty one is the whole answer.
      if (j.type === 'chunk' && typeof j.content === 'string' && j.content.trim()) text = j.content
    } catch {
      if (data.trim()) text = data
    }
  }
  return text
}

export async function askAssistant(message: string, history: ChatTurn[], f: typeof fetch = fetch): Promise<string | null> {
  const base = process.env.VPS_BRIDGE_URL
  if (!base) return null
  const r = await f(`${base}/aivory-assistant/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, context: { history, mode: 'general', page: 'crm' } }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!r.ok) return null
  return lastChunkText(await r.text())
}
