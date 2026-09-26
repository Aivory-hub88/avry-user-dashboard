/** Text extraction for room files (ADR-019 P3), with real PDF/DOCX/XLSX bytes built here. */
import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import { extractText } from "@/lib/roomFileText"

const enc = (s: string) => new TextEncoder().encode(s)

/** Smallest valid one-page PDF with a Helvetica text run. */
function makePdf(text: string): Uint8Array {
  const stream = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]
  let out = "%PDF-1.4\n"
  const offs: number[] = []
  objs.forEach((o, i) => {
    offs.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return enc(out)
}

async function makeDocx(paragraphs: string[]): Promise<Uint8Array> {
  const z = new JSZip()
  z.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  )
  z.file(
    "_rels/.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  )
  z.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs
      .map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`)
      .join("")}</w:body></w:document>`,
  )
  return z.generateAsync({ type: "uint8array" })
}

async function makeXlsx(): Promise<Uint8Array> {
  const z = new JSZip()
  z.file("xl/workbook.xml", `<workbook><sheets><sheet name="Customers" sheetId="1"/></sheets></workbook>`)
  z.file("xl/sharedStrings.xml", `<sst><si><t>Customer</t></si><si><t>City</t></si><si><t>Acme &amp; Co</t></si><si><t>Jakarta</t></si></sst>`)
  z.file(
    "xl/worksheets/sheet1.xml",
    `<worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>Rows</t></is></c></row>
      <row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>1248</v></c></row>
      <row r="3"><c r="B3" t="s"><v>3</v></c></row>
    </sheetData></worksheet>`,
  )
  return z.generateAsync({ type: "uint8array" })
}

describe("extractText", () => {
  it("reads PDF text", async () => {
    expect((await extractText(makePdf("Odoo migration before 30 November"), "application/pdf")).trim()).toBe("Odoo migration before 30 November")
  })

  it("reads DOCX paragraphs", async () => {
    const t = await extractText(await makeDocx(["Migration plan", "Import customers first."]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    expect(t).toContain("Migration plan")
    expect(t).toContain("Import customers first.")
  })

  it("reads XLSX as tab-separated rows with shared and inline strings, keeping column positions", async () => {
    const t = await extractText(await makeXlsx(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    expect(t).toBe("Sheet: Customers\nCustomer\tCity\tRows\nAcme & Co\t\t1248\n\tJakarta")
  })

  it("reads CSV / text as UTF-8 without a BOM", async () => {
    expect(await extractText(enc("﻿Customer,City\nAcme,Jakarta\n"), "text/csv")).toBe("Customer,City\nAcme,Jakarta\n")
  })

  it("has no text for images", async () => {
    expect(await extractText(new Uint8Array([1, 2, 3]), "image/png")).toBe("")
  })
})
