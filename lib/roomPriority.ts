import { extractAgentMentions } from "@/lib/agentHandoff"

/**
 * Who should be admitted first when a round has more calls than free slots (see CallGovernor).
 *
 * Order, lowest rank first:
 *   0  agents the user named by hand ("@Lex ...") - they were addressed;
 *   1  the agent that holds the floor in this thread - the user is mid-conversation with it;
 *   2+ the rest, ranked by how well the message matches their role (AutoGen's selector picks the
 *      next speaker from each agent's description; this is the deterministic, free version of it),
 *      then by room order.
 *
 * Pure and cheap: no model call. It only reorders admission, it never drops an agent, so a wrong
 * guess costs a few seconds of waiting, not a missing answer.
 */

export interface PriorityCandidate {
  type: string
  name: string
  title: string
}

/** Words that mark a message as belonging to a role. Indonesian + English, matching the room. */
const ROLE_LEXICON: Record<string, string[]> = {
  leads_qualifier: ["lead", "leads", "prospek", "sales", "penjualan", "crm", "deal", "outbound", "cold", "pipeline", "closing", "calon", "klien", "cta", "kampanye"],
  finance_invoice_ops: ["invoice", "tagihan", "budget", "biaya", "anggaran", "pajak", "pembayaran", "bayar", "finance", "keuangan", "harga", "spend", "iklan", "ads"],
  customer_service: ["tiket", "ticket", "keluhan", "komplain", "support", "pelanggan", "customer", "refund", "balasan"],
  office_assistant: ["jadwal", "kalender", "calendar", "meeting", "rapat", "dokumen", "sheet", "spreadsheet", "agenda", "docs", "email", "mail"],
  chief_of_staff: ["plan", "rencana", "prioritas", "koordinasi", "tim", "task", "timeline", "roadmap", "keputusan", "approval"],
  data_analyst: ["data", "analisis", "metrik", "metric", "kpi", "laporan", "dashboard", "statistik", "angka", "growth", "tracking", "engagement"],
  operations_inventory: ["stok", "inventori", "inventory", "gudang", "operasional", "supplier", "pengiriman", "produksi"],
  marketing_content: ["konten", "content", "posting", "bio", "hook", "caption", "thread", "threads", "sosmed", "instagram", "brand", "copy", "followers"],
  deep_researcher: ["riset", "research", "benchmark", "kompetitor", "competitor", "studi", "sumber", "referensi"],
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/[\s_-]+/)
    .filter((t) => t.length > 1)
}

/** How many of the message's words belong to this agent's role (its lexicon, title and name). */
export function roleScore(text: string, c: PriorityCandidate): number {
  const words = new Set(tokens(text))
  const own = new Set([...(ROLE_LEXICON[c.type] ?? []), ...tokens(c.title), ...tokens(c.name)])
  let score = 0
  for (const w of words) if (own.has(w)) score++
  return score
}

export interface RankInput {
  /** The user's raw message. */
  text: string
  /** Agent types answering this round, in room order. */
  targets: string[]
  candidates: PriorityCandidate[]
  /** Agent that spoke last in this thread, if any. */
  floor?: string | null
}

/** Rank per agent type (0 = start first). Every target gets one; ranks are distinct. */
export function rankTargets({ text, targets, candidates, floor = null }: RankInput): Record<string, number> {
  const order = [...new Set(targets)]
  const byType = new Map(candidates.map((c) => [c.type, c]))
  const named = new Set(extractAgentMentions(text, candidates))
  const ranked = order
    .map((type, i) => ({ type, i, score: byType.has(type) ? roleScore(text, byType.get(type)!) : 0 }))
    .sort((a, b) => {
      const tier = (t: string) => (named.has(t) ? 0 : t === floor ? 1 : 2)
      return tier(a.type) - tier(b.type) || b.score - a.score || a.i - b.i
    })
  const out: Record<string, number> = {}
  ranked.forEach((r, i) => {
    out[r.type] = i
  })
  return out
}
