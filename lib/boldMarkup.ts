/**
 * Minimal `**bold**` support for model-written report text (website insights).
 * Returns plain segments so callers render <strong> as React elements; nothing
 * here ever produces HTML, so website-influenced text cannot inject markup.
 * Unbalanced or empty markers are dropped rather than shown.
 */
export interface BoldSegment {
  text: string
  bold: boolean
}

export function splitBold(input: string): BoldSegment[] {
  const out: BoldSegment[] = []
  const parts = String(input ?? '').split('**')
  // Even indexes are outside a pair, odd indexes inside. With an odd number of
  // markers the last "inside" part has no closer, so it is treated as plain.
  const closed = parts.length % 2 === 1 ? parts.length : parts.length - 1
  parts.forEach((text, i) => {
    if (!text) return
    out.push({ text, bold: i % 2 === 1 && i < closed })
  })
  return out
}
