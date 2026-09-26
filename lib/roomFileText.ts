/**
 * Plain text out of a room file — SERVER-ONLY (ADR-019 P3).
 *
 * PDF via unpdf (a serverless pdfjs build: no worker, no native canvas —
 * plain pdfjs-dist needs @napi-rs/canvas for DOMMatrix and failed to load
 * on the Node 20 Alpine image), DOCX via mammoth, XLSX by reading the sheet XML out of the zip
 * (jszip), CSV/TXT/MD as UTF-8. Images carry no text here. Output is capped
 * so one huge file can't dominate the index.
 */
import JSZip from "jszip"

export const MAX_TEXT_CHARS = 200_000
const MAX_PDF_PAGES = 80
const MAX_SHEETS = 5
const MAX_SHEET_ROWS = 2000

const decode = (b: Uint8Array) => new TextDecoder("utf-8", { fatal: false }).decode(b).replace(/^﻿/, "")

async function pdfText(bytes: Uint8Array): Promise<string> {
  const { getDocumentProxy, extractText: pdfPages } = await import("unpdf")
  const pdf = await getDocumentProxy(bytes)
  const { text } = await pdfPages(pdf, { mergePages: false })
  return (text as string[])
    .slice(0, MAX_PDF_PAGES)
    .map((t) => t.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
}

async function docxText(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth")
  const r = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
  return r.value
}

const xmlDecode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")

/** Column letters of a cell ref ("AB12" → 27, zero-based). */
function colIndex(ref: string): number {
  const letters = ref.replace(/\d+$/, "")
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** XLSX → one tab-separated block per sheet ("Sheet name" heading, then rows). */
export async function xlsxText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  const shared: string[] = []
  const ss = await zip.file("xl/sharedStrings.xml")?.async("string")
  if (ss) {
    for (const si of ss.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
      shared.push(xmlDecode((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("")))
    }
  }
  const wb = (await zip.file("xl/workbook.xml")?.async("string")) ?? ""
  const names = [...wb.matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => xmlDecode(m[1]))
  const sheetFiles = Object.keys(zip.files)
    .filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]))
    .slice(0, MAX_SHEETS)

  const blocks: string[] = []
  for (const [i, f] of sheetFiles.entries()) {
    const xml = await zip.file(f)!.async("string")
    const lines: string[] = []
    for (const row of (xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? []).slice(0, MAX_SHEET_ROWS)) {
      const cells: string[] = []
      for (const c of row.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
        const ref = c.match(/ r="([A-Z]+\d+)"/)?.[1]
        const type = c.match(/ t="(\w+)"/)?.[1]
        const v = c.match(/<v>([\s\S]*?)<\/v>/)?.[1]
        const inline = c.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/)?.[1]
        const value = type === "s" && v !== undefined ? shared[Number(v)] ?? "" : inline !== undefined ? xmlDecode(inline) : v !== undefined ? xmlDecode(v) : ""
        const at = ref ? colIndex(ref) : cells.length
        while (cells.length < at) cells.push("")
        cells[at] = value
      }
      if (cells.some((x) => x.trim())) lines.push(cells.join("\t"))
    }
    if (lines.length) blocks.push(`Sheet: ${names[i] ?? `Sheet ${i + 1}`}\n${lines.join("\n")}`)
  }
  return blocks.join("\n\n")
}

/** Text for a supported mime, "" for types without text (images), throws on a corrupt file. */
export async function extractText(bytes: Uint8Array, mime: string): Promise<string> {
  let text = ""
  if (mime === "application/pdf") text = await pdfText(bytes)
  else if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") text = await docxText(bytes)
  else if (mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") text = await xlsxText(bytes)
  else if (mime === "text/csv" || mime === "text/plain" || mime === "text/markdown") text = decode(bytes)
  return text.slice(0, MAX_TEXT_CHARS)
}
