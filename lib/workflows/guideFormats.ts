/** Guide format converters: markdown -> plain text / minimal valid PDF (no deps). */

export function mdToText(md: string): string {
  return md
    .split("\n")
    .map((l) => {
      let t = l
      t = t.replace(/^#{1,6}\s+/, "")
      t = t.replace(/\*\*([^*]+)\*\*/g, "$1")
      t = t.replace(/`([^`]+)`/g, "$1")
      t = t.replace(/^>\s?/, "")
      t = t.replace(/^\s*\|(.+)\|\s*$/, (_, row) =>
        String(row)
          .split("|")
          .map((c) => c.trim())
          .filter(Boolean)
          .join("  --  ")
      )
      t = t.replace(/^\s*\|[-\s|:]+\|\s*$/, "")
      t = t.replace(/^- \[ \]\s*/, "[ ] ")
      return t
    })
    .join("\n")
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
}

function stripMd(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^>\s?/, "")
    .replace(/^\s*\|(.+)\|\s*$/, (_, row) =>
      "  " + String(row).split("|").map((c) => c.trim()).filter(Boolean).join("  --  ")
    )
    .replace(/^\s*\|[-\s|:]+\|\s*$/, "")
    .replace(/^- \[ \]\s*/, "[ ] ")
    .replace(/^- /, "- ")
}

/** Minimal single-font PDF writer. A4, Helvetica, word-wrapped, auto pages. */
export function mdToPdf(md: string): Buffer {
  const PAGE_W = 595, PAGE_H = 842, M = 54, LH = 14
  const maxChars = 92
  type Line = { text: string; font: "F1" | "F2"; size: number; gap: number }
  const lines: Line[] = []
  for (const raw of md.split("\n")) {
    const isH1 = /^#\s/.test(raw)
    const isH2 = /^##\s/.test(raw)
    const isH3 = /^###\s/.test(raw)
    const bold = /\*\*[^*]+\*\*/.test(raw) || isH1 || isH2 || isH3
    const clean = stripMd(raw)
    if (!clean.trim()) { lines.push({ text: "", font: "F1", size: 10, gap: 7 }); continue }
    const font = isH1 || isH2 || isH3 || bold ? "F2" : "F1"
    const size = isH1 ? 15 : isH2 ? 12.5 : isH3 ? 11 : 10
    const words = clean.split(/\s+/)
    let cur = ""
    const push = (t: string) => lines.push({ text: t, font, size, gap: isH1 || isH2 || isH3 ? 6 : 2 })
    for (const w of words) {
      if ((cur + " " + w).trim().length > maxChars) { push(cur.trim()); cur = w }
      else cur = (cur + " " + w).trim()
    }
    if (cur) push(cur)
    if (isH1 || isH2) lines.push({ text: "", font: "F1", size: 10, gap: 4 })
  }

  const pages: Line[][] = []
  let page: Line[] = []
  let y = PAGE_H - M
  for (const l of lines) {
    if (y - LH < M) { pages.push(page); page = []; y = PAGE_H - M }
    page.push(l)
    y -= LH + l.gap
  }
  if (page.length) pages.push(page)

  const chunks: Buffer[] = []
  const offsets: number[] = []
  let total = 0
  const push = (b: Buffer | string) => {
    const buf = typeof b === "string" ? Buffer.from(b, "latin1") : b
    chunks.push(buf)
    total += buf.length
  }
  const obj = (body: string) => { offsets.push(total); push(`${body}\n`) }
  const streamObj = (dict: string, content: string) => {
    offsets.push(total)
    push(`${dict}\nstream\n${content}\nendstream\n`)
  }

  push("%PDF-1.4\n")
  const nPages = pages.length
  const kids = Array.from({ length: nPages }, (_, i) => `${4 + i * 2} 0 R`).join(" ")
  obj("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj")
  obj(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${nPages} >>\nendobj`)
  obj("3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj")
  obj("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj")

  pages.forEach((pg, i) => {
    let c = ""
    let y = PAGE_H - M
    for (const l of pg) {
      if (l.text) {
        c += `BT /${l.font} ${l.size} Tf ${M} ${y} Td (${esc(l.text)}) Tj ET\n`
      }
      y -= LH + l.gap
    }
    streamObj(`${4 + i * 2} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 5 0 R >> >> /Contents ${5 + i * 2} 0 R >>`, c)
    obj(`${5 + i * 2} 0 obj\n<< /Length ${Buffer.byteLength(c, "latin1")} >>\nendobj`)
  })

  const xrefPos = total
  let xref = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) xref += `${String(o).padStart(10, "0")} 00000 n \n`
  push(xref)
  push(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`)
  return Buffer.concat(chunks)
}
