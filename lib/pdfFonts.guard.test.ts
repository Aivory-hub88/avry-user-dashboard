import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// The report, blueprint and roadmap PDFs embed self-hosted Manrope. A literal
// family in setFont (e.g. 'helvetica') or Manrope 'italic' (Manrope has no
// italic → jsPDF falls back to Times-Italic) puts a second typeface in the
// document. Use F()/FB()/FD() for the family and IT() for caption style.
const FILES = ['lib/pdfExport.ts', 'lib/blueprintExport.ts', 'app/roadmap/page.tsx']

describe('PDF generators only use the embedded Manrope/Doto helpers', () => {
  for (const file of FILES) {
    it(file, () => {
      const src = readFileSync(path.join(process.cwd(), file), 'utf8')
      const calls = [...src.matchAll(/\.setFont\(([^)]*)\)/g)].map((m) => m[1].trim())
      expect(calls.length).toBeGreaterThan(0)
      const bad = calls.filter((args) => /^['"]/.test(args) || /['"]italic['"]/.test(args))
      expect(bad).toEqual([])
      // …and no local helper that shadows F()/FB() with a literal family
      // (app/roadmap had `const FB = () => 'Helvetica'`).
      const shadowing = [...src.matchAll(/const\s+(F|FB|FD|IT|AKL|AKR)\s*=\s*\(\)\s*=>\s*['"][^'"]+['"]/g)].map((m) => m[0])
      expect(shadowing).toEqual([])
      // Manrope has no check-mark glyphs — they render as blank boxes in the
      // PDF. Use '•' (present in Manrope) for status marks.
      const codeOnly = src.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
      expect(codeOnly.match(/[✓✔✗✘]/g) ?? []).toEqual([])
    })
  }
})
