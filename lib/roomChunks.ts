/**
 * Room file text → chunks → the few that matter for a question (ADR-019 P3).
 * Pure, no I/O.
 *
 * Ranking is lexical on purpose: production has no embedding key, so this
 * must work alone. It's BM25-lite over the room's own chunks (a room has a
 * few hundred at most), with English + Indonesian stopwords removed.
 * When embeddings are configured the caller may rank by vector instead.
 */

export const CHUNK_CHARS = 1200
export const CHUNK_OVERLAP = 150
export const MAX_CHUNKS_PER_FILE = 200

/**
 * Split into ~CHUNK_CHARS pieces, preferring paragraph, then line, then
 * sentence boundaries, with a small overlap so a fact split across a
 * boundary still appears whole in one chunk.
 */
export function chunkText(text: string, size = CHUNK_CHARS, overlap = CHUNK_OVERLAP): string[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  if (!clean) return []
  const out: string[] = []
  let start = 0
  while (start < clean.length && out.length < MAX_CHUNKS_PER_FILE) {
    let end = Math.min(clean.length, start + size)
    if (end < clean.length) {
      const window = clean.slice(start, end)
      const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(". "))
      if (cut > size * 0.5) end = start + cut + 1
    }
    const piece = clean.slice(start, end).trim()
    if (piece) out.push(piece)
    if (end >= clean.length) break
    start = Math.max(end - overlap, start + 1)
  }
  return out
}

const STOPWORDS = new Set(
  (
    "the a an and or but of to in on at for with by from is are was were be been this that these those it its as " +
    "what which who whom how when where why can could should would will do does did have has had not no yes you your " +
    "we our they their he she his her i me my us about into than then there here so if any all some more most please " +
    "yang dan atau di ke dari untuk dengan ini itu adalah akan ada tidak bisa saya kami kita mereka apa bagaimana " +
    "kapan dimana kenapa juga sudah belum dalam pada oleh sebagai jadi agar supaya tolong mohon"
  ).split(" "),
)

export function terms(text: string): string[] {
  return (text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter(
    (t) => !STOPWORDS.has(t),
  )
}

export interface RankedChunk<T> {
  item: T
  score: number
}

/** BM25-lite: top `k` items whose text best matches `query`; empty when nothing matches. */
export function rankChunks<T extends { text: string }>(query: string, items: T[], k = 5): RankedChunk<T>[] {
  const q = [...new Set(terms(query))]
  if (q.length === 0 || items.length === 0) return []
  const docs = items.map((it) => terms(it.text))
  const avgLen = docs.reduce((n, d) => n + d.length, 0) / docs.length || 1
  const df = new Map<string, number>()
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1)
  const N = docs.length
  const k1 = 1.2
  const b = 0.75
  const scored: RankedChunk<T>[] = []
  docs.forEach((d, i) => {
    const tf = new Map<string, number>()
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1)
    let score = 0
    for (const t of q) {
      const f = tf.get(t)
      if (!f) continue
      const n = df.get(t) ?? 0
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avgLen)))
    }
    if (score > 0) scored.push({ item: items[i], score })
  })
  return scored.sort((x, y) => y.score - x.score).slice(0, k)
}
