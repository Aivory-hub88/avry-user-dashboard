/**
 * Whisper invents text from silence or hum, and can read its own prompt back.
 * These checks drop such transcripts so they never land in the composer.
 */

/** Phrases Whisper emits for near-silent audio (learned from subtitle data). */
const HALLUCINATIONS = [
  "terima kasih telah menonton",
  "terima kasih sudah menonton",
  "terima kasih sudah menonton video ini",
  "sampai jumpa di video berikutnya",
  "jangan lupa subscribe",
  "subtitle oleh",
  "subtitles by",
  "thanks for watching",
  "thank you for watching",
  "please subscribe",
  "like and subscribe",
  "amara.org",
]

/** Fragments of the backend's recognition prompt; reading them back is an echo. */
const PROMPT_FRAGMENTS = ["percakapan bahasa indonesia dan inggris", "nama dan istilah"]

/** A hallucination is a stand-alone phrase, not a long dictation that mentions it. */
const MAX_HALLUCINATION_WORDS = 12

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()

/** Words Whisper says on silence when nothing else came out. */
const FILLER_ONLY = new Set(["you", "thank you", "thanks", "bye", "terima kasih", "oke", "ok"])

/**
 * True when `text` is most likely not something the user said. `terms` are the
 * names sent as recognition hints: a clip that is only those names, three or
 * more of them, is the prompt echoed back (a single name is a real answer).
 */
export function isLikelyHallucination(text: string, terms: readonly string[] = []): boolean {
  const t = normalize(text)
  if (!t) return true
  const words = t.split(" ")

  if (PROMPT_FRAGMENTS.some((f) => t.includes(f))) return true
  if (words.length <= MAX_HALLUCINATION_WORDS && HALLUCINATIONS.some((h) => t.includes(h))) {
    return true
  }
  if (FILLER_ONLY.has(t.replace(/\./g, "").trim())) return true

  const termWords = new Set(terms.flatMap((x) => normalize(x).split(" ")).filter(Boolean))
  if (termWords.size > 0 && words.every((w) => termWords.has(w.replace(/\./g, "")))) {
    const distinct = new Set(words.map((w) => w.replace(/\./g, "")))
    if (distinct.size >= 3) return true
  }
  return false
}
