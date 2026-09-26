"use client"

/**
 * Small spreadsheet for a project request (ADR-019 P1). The first column
 * becomes each task's title when the room opens; the rest become text
 * fields. Pasting cells copied from Excel / Sheets (tab-separated) fills the
 * grid from the cell you paste into, adding rows and columns as needed.
 */
import { Plus, X } from "lucide-react"
import { LIMITS, type DataTable } from "@/lib/projectRequests"

interface Props {
  value: DataTable
  onChange: (next: DataTable) => void
  readOnly?: boolean
}

const cellClass =
  "w-full min-w-[120px] bg-transparent px-2.5 py-1.5 text-[12px] text-white/80 outline-none placeholder:text-white/20 focus:bg-white/[0.05]"

export default function DataTableEditor({ value, onChange, readOnly }: Props) {
  const { columns, rows } = value
  const hasTable = columns.length > 0

  const setCell = (r: number, c: number, text: string) => {
    const next = rows.map((row) => [...row])
    while (next.length <= r) next.push(columns.map(() => ""))
    next[r][c] = text
    onChange({ columns, rows: next })
  }

  const setColumn = (c: number, name: string) => onChange({ columns: columns.map((x, i) => (i === c ? name : x)), rows })

  const addColumn = () => {
    if (columns.length >= LIMITS.columns) return
    onChange({ columns: [...columns, `Column ${columns.length + 1}`], rows: rows.map((r) => [...r, ""]) })
  }

  const removeColumn = (c: number) =>
    onChange({ columns: columns.filter((_, i) => i !== c), rows: rows.map((r) => r.filter((_, i) => i !== c)) })

  const addRow = () => {
    if (rows.length >= LIMITS.rows) return
    onChange({ columns, rows: [...rows, columns.map(() => "")] })
  }

  const removeRow = (r: number) => onChange({ columns, rows: rows.filter((_, i) => i !== r) })

  const onPaste = (r: number, c: number) => (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text/plain")
    if (!text.includes("\t") && !text.includes("\n")) return
    e.preventDefault()
    const grid = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((line) => line.split("\t"))
    const width = Math.min(LIMITS.columns, Math.max(columns.length, c + Math.max(...grid.map((g) => g.length))))
    const cols = [...columns]
    while (cols.length < width) cols.push(`Column ${cols.length + 1}`)
    const next = rows.map((row) => cols.map((_, i) => row[i] ?? ""))
    grid.forEach((line, dr) => {
      const ri = r + dr
      if (ri >= LIMITS.rows) return
      while (next.length <= ri) next.push(cols.map(() => ""))
      line.forEach((cell, dc) => {
        if (c + dc < width) next[ri][c + dc] = cell.slice(0, LIMITS.cell)
      })
    })
    onChange({ columns: cols, rows: next })
  }

  if (!hasTable) {
    if (readOnly) return <div className="text-[12px] text-white/30">No table added.</div>
    return (
      <button
        type="button"
        onClick={() => onChange({ columns: ["Name", "Details"], rows: [["", ""]] })}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line py-6 text-[12px] text-white/45 transition-colors duration-150 hover:border-white/20 hover:text-white/70"
      >
        <Plus className="h-3.5 w-3.5" />
        <span>Add a table</span>
      </button>
    )
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-white/[0.03]">
              {columns.map((col, c) => (
                <th key={c} className="group border-b border-r border-line p-0 text-left font-normal last:border-r-0">
                  <div className="flex items-center">
                    <input
                      value={col}
                      readOnly={readOnly}
                      onChange={(e) => setColumn(c, e.target.value.slice(0, LIMITS.columnName))}
                      aria-label={`Column ${c + 1} name`}
                      className={`${cellClass} font-medium text-white/60`}
                    />
                    {!readOnly && columns.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeColumn(c)}
                        aria-label={`Remove column ${col}`}
                        className="mr-1 rounded p-1 text-white/25 opacity-0 transition-opacity duration-150 hover:text-white/70 focus:opacity-100 group-hover:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              {!readOnly && <th className="w-8 border-b border-line" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="group">
                {columns.map((_, c) => (
                  <td key={c} className="border-b border-r border-line p-0 last:border-r-0">
                    <input
                      value={row[c] ?? ""}
                      readOnly={readOnly}
                      onChange={(e) => setCell(r, c, e.target.value.slice(0, LIMITS.cell))}
                      onPaste={readOnly ? undefined : onPaste(r, c)}
                      aria-label={`Row ${r + 1}, ${columns[c]}`}
                      className={cellClass}
                    />
                  </td>
                ))}
                {!readOnly && (
                  <td className="w-8 border-b border-line p-0 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(r)}
                      aria-label={`Remove row ${r + 1}`}
                      className="rounded p-1 text-white/25 opacity-0 transition-opacity duration-150 hover:text-white/70 focus:opacity-100 group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="mt-2 flex items-center gap-1">
          <button
            type="button"
            onClick={addRow}
            disabled={rows.length >= LIMITS.rows}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] text-white/45 hover:bg-white/[0.05] hover:text-white/75 disabled:opacity-30"
          >
            <Plus className="h-3 w-3" /> Row
          </button>
          <button
            type="button"
            onClick={addColumn}
            disabled={columns.length >= LIMITS.columns}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] text-white/45 hover:bg-white/[0.05] hover:text-white/75 disabled:opacity-30"
          >
            <Plus className="h-3 w-3" /> Column
          </button>
          <span className="ml-auto text-[11px] text-white/25">Paste from a spreadsheet to fill several cells at once</span>
        </div>
      )}
    </div>
  )
}
