"use client"

/**
 * CSV import: pick a file, check the guessed column mapping, see what will be
 * created, import. Parsing happens in the browser; only the resulting
 * companies and contacts are sent to the CRM.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { Upload, X } from "lucide-react"
import { Button } from "@/components/requests/requestUi"
import { runImport, type ImportResult } from "@/components/crm/onboardingActions"
import type { Company } from "@/lib/crmClient"
import { buildImportPlan, guessMapping, IMPORT_FIELD_LABEL, IMPORT_FIELDS, MAX_IMPORT_ROWS, parseCsv, type ImportField } from "@/lib/crmOnboarding"

const MAX_FILE_BYTES = 2 * 1024 * 1024

type Step = { kind: "pick" } | { kind: "map"; file: string; header: string[]; rows: string[][] } | { kind: "running"; done: number; total: number } | { kind: "done"; result: ImportResult }

export default function ImportDialog({ companies, onClose, onImported }: { companies: Company[]; onClose: () => void; onImported: () => void }) {
  const [step, setStep] = useState<Step>({ kind: "pick" })
  const [mapping, setMapping] = useState<(ImportField | null)[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && step.kind !== "running" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, step.kind])

  const readFile = async (f: File) => {
    setError(null)
    if (f.size > MAX_FILE_BYTES) return setError("That file is over 2 MB. Split it into smaller files.")
    if (!/\.(csv|tsv|txt)$/i.test(f.name) && !f.type.includes("csv") && !f.type.startsWith("text/")) return setError("Choose a .csv file. In Excel or Google Sheets: File, Download, CSV.")
    const rows = parseCsv(await f.text())
    if (rows.length < 2) return setError("We couldn't find a header row and at least one row of data in that file.")
    const [header, ...data] = rows
    setMapping(guessMapping(header))
    setStep({ kind: "map", file: f.name, header, rows: data })
  }

  const plan = useMemo(
    () => (step.kind === "map" ? buildImportPlan(step.rows, mapping, companies.map((c) => c.name)) : null),
    [step, mapping, companies],
  )
  const hasPerson = mapping.some((m) => m === "name" || m === "first_name" || m === "last_name" || m === "email")
  const hasCompany = mapping.includes("company")

  const start = async () => {
    if (!plan) return
    const total = plan.companies.length + plan.contacts.length
    setStep({ kind: "running", done: 0, total })
    const result = await runImport(plan, companies, (done, t) => setStep({ kind: "running", done, total: t }))
    setStep({ kind: "done", result })
    onImported()
  }

  const setCol = (i: number, f: ImportField | null) =>
    setMapping((m) => m.map((x, j) => (j === i ? f : f !== null && x === f ? null : x)))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55" onClick={() => step.kind !== "running" && onClose()} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Import contacts" className="relative flex max-h-[88vh] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <span className="text-[15px] font-medium text-white/90">Import contacts and companies</span>
          {step.kind !== "running" && (
            <button onClick={onClose} aria-label="Close" className="text-white/45 hover:text-white/85">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {error && <div className="mb-4 rounded-xl bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">{error}</div>}

          {step.kind === "pick" && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  const f = e.dataTransfer.files?.[0]
                  if (f) void readFile(f)
                }}
                className={`flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-12 text-center transition-colors ${dragOver ? "border-white/40 bg-white/[0.05]" : "border-white/15 hover:bg-white/[0.03]"}`}
              >
                <Upload className="h-6 w-6 text-white/60" />
                <span className="text-[14px] text-white/85">Drop a CSV here, or click to choose one</span>
                <span className="text-[12px] text-white/50">Up to {MAX_IMPORT_ROWS} rows. The first row must be the column names.</span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.tsv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void readFile(f)
                  e.target.value = ""
                }}
              />
              <div className="text-[12px] leading-relaxed text-white/50">
                Works with exports from Google Contacts, HubSpot, Pipedrive, Excel or Google Sheets. Each row becomes a person; company names become companies (ones you already have are reused).
              </div>
            </div>
          )}

          {step.kind === "map" && plan && (
            <div className="space-y-5">
              <div className="text-[12px] text-white/55">
                {step.file} · {step.rows.length} rows. Check what each column is; set the ones you don&apos;t need to &quot;Skip&quot;.
              </div>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[520px] text-left text-[12px]">
                  <thead className="text-white/50">
                    <tr className="border-b border-line">
                      <th className="px-3 py-2 font-normal">Column in your file</th>
                      <th className="px-3 py-2 font-normal">First value</th>
                      <th className="px-3 py-2 font-normal">Import as</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {step.header.map((h, i) => (
                      <tr key={i}>
                        <td className="max-w-[180px] truncate px-3 py-2 text-white/85">{h || <span className="text-white/35">(no name)</span>}</td>
                        <td className="max-w-[200px] truncate px-3 py-2 text-white/55">{step.rows.find((r) => r[i]?.trim())?.[i] ?? ""}</td>
                        <td className="px-3 py-1.5">
                          <select
                            value={mapping[i] ?? ""}
                            onChange={(e) => setCol(i, (e.target.value || null) as ImportField | null)}
                            aria-label={`Import ${h} as`}
                            className={`w-full rounded-lg border border-line bg-white/[0.04] px-2 py-1.5 text-[12px] outline-none ${mapping[i] ? "text-white/90" : "text-white/40"}`}
                          >
                            <option value="">Skip</option>
                            {IMPORT_FIELDS.map((f) => (
                              <option key={f} value={f}>
                                {IMPORT_FIELD_LABEL[f]}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!hasPerson && !hasCompany ? (
                <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">Pick at least a name, email or company column.</div>
              ) : (
                <div className="rounded-xl bg-white/[0.04] px-4 py-3 text-[13px] text-white/80">
                  Will create <span className="font-medium text-white">{plan.contacts.length}</span> {plan.contacts.length === 1 ? "person" : "people"} and{" "}
                  <span className="font-medium text-white">{plan.companies.length}</span> new {plan.companies.length === 1 ? "company" : "companies"}
                  {plan.skipped > 0 && <span className="text-white/50"> · {plan.skipped} rows skipped (empty or over the {MAX_IMPORT_ROWS}-row limit)</span>}.
                </div>
              )}
            </div>
          )}

          {step.kind === "running" && (
            <div className="space-y-3 py-6">
              <div className="text-[13px] text-white/80">
                Importing… {step.done} of {step.total}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                <div className="h-full rounded-full bg-white transition-[width] duration-200" style={{ width: `${step.total ? (step.done / step.total) * 100 : 100}%` }} />
              </div>
              <div className="text-[12px] text-white/45">Keep this window open until it finishes.</div>
            </div>
          )}

          {step.kind === "done" && (
            <div className="space-y-2 py-6">
              <div className="text-[15px] text-white">
                Imported {step.result.contacts} {step.result.contacts === 1 ? "person" : "people"} and {step.result.companies} {step.result.companies === 1 ? "company" : "companies"}
              </div>
              {step.result.failed > 0 && (
                <div className="text-[12px] text-amber-200">{step.result.failed} rows could not be saved (often an invalid email). The rest went in.</div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">
          {step.kind === "map" && (
            <>
              <Button onClick={() => setStep({ kind: "pick" })}>Choose another file</Button>
              <Button tone="primary" onClick={() => void start()} disabled={!plan || plan.contacts.length + plan.companies.length === 0}>
                Import
              </Button>
            </>
          )}
          {step.kind === "done" && (
            <Button tone="primary" onClick={onClose}>
              Done
            </Button>
          )}
          {step.kind === "pick" && <Button onClick={onClose}>Cancel</Button>}
        </div>
      </div>
    </div>
  )
}
