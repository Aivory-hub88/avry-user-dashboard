"use client"

/**
 * File list + uploader for a request or a room (ADR-019 P0/P1). Uploads run
 * in parallel straight to R2; each row shows its own progress and error so a
 * failed file never blocks the others.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Download, FileText, Trash2, Upload } from "lucide-react"
import { filesApi, uploadFile, uploadProblem, type FileBase } from "@/lib/requestsClient"
import type { WorkspaceFile } from "@/lib/workspaceFiles"
import { formatBytes } from "@/components/requests/requestUi"

type Pending = { key: string; name: string; progress: number; error: string | null }

export default function FileAttachments({ base, canWrite }: { base: FileBase; canWrite: boolean }) {
  const [files, setFiles] = useState<WorkspaceFile[] | null>(null)
  const [pending, setPending] = useState<Pending[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    try {
      setFiles(await filesApi.list(base))
      setLoadError(null)
    } catch (e) {
      setLoadError((e as Error).message)
    }
  }, [base])

  useEffect(() => {
    // Fetch on mount; load() only sets state after its await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const patchPending = (key: string, patch: Partial<Pending>) =>
    setPending((p) => p.map((x) => (x.key === key ? { ...x, ...patch } : x)))

  const addFiles = (list: FileList | null) => {
    if (!list || !canWrite) return
    for (const f of Array.from(list)) {
      const key = `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`
      const problem = uploadProblem(f)
      setPending((p) => [...p, { key, name: f.name, progress: 0, error: problem }])
      if (problem) continue
      uploadFile(base, f, (progress) => patchPending(key, { progress }))
        .then((file) => {
          setFiles((cur) => [file, ...(cur ?? [])])
          setPending((p) => p.filter((x) => x.key !== key))
        })
        .catch((e) => patchPending(key, { error: (e as Error).message }))
    }
  }

  const download = async (f: WorkspaceFile) => {
    try {
      window.location.assign(await filesApi.download(base, f.id))
    } catch (e) {
      setLoadError((e as Error).message)
    }
  }

  const remove = async (f: WorkspaceFile) => {
    const prev = files
    setFiles((cur) => (cur ?? []).filter((x) => x.id !== f.id))
    try {
      await filesApi.remove(base, f.id)
    } catch (e) {
      setFiles(prev)
      setLoadError((e as Error).message)
    }
  }

  return (
    <div>
      {canWrite && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            addFiles(e.dataTransfer.files)
          }}
          className={`mb-3 flex items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-4 transition-colors duration-150 ${
            dragging ? "border-white/35 bg-white/[0.05]" : "border-line"
          }`}
        >
          <div className="min-w-0">
            <div className="text-[12px] text-white/60">Drop files here</div>
            <div className="mt-0.5 text-[11px] text-white/30">PDF, Word, Excel, CSV, text or images, up to 25 MB each</div>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/70 transition-[transform,background-color] duration-150 ease-out hover:bg-white/[0.08] active:scale-[0.97]"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Choose files</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ""
            }}
          />
        </div>
      )}

      {loadError && <div className="mb-2 text-[12px] text-amber-300/80">{loadError}</div>}

      <div className="divide-y divide-line rounded-xl border border-line empty:hidden">
        {pending.map((p) => (
          <div key={p.key} className="flex items-center gap-3 px-3 py-2.5">
            <FileText className="h-4 w-4 shrink-0 text-white/25" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-white/70">{p.name}</div>
              {p.error ? (
                <div className="mt-0.5 text-[11px] text-amber-300/80">{p.error}</div>
              ) : (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full origin-left rounded-full bg-white/50 transition-transform duration-200 ease-out"
                    style={{ transform: `scaleX(${Math.max(0.03, p.progress)})` }}
                  />
                </div>
              )}
            </div>
            {p.error && (
              <button
                type="button"
                onClick={() => setPending((cur) => cur.filter((x) => x.key !== p.key))}
                className="text-[11px] text-white/40 hover:text-white/70"
              >
                Dismiss
              </button>
            )}
          </div>
        ))}
        {(files ?? []).map((f) => (
          <div key={f.id} className="group flex items-center gap-3 px-3 py-2.5">
            <FileText className="h-4 w-4 shrink-0 text-white/35" />
            <button type="button" onClick={() => download(f)} className="min-w-0 flex-1 text-left">
              <div className="truncate text-[12px] text-white/80 group-hover:text-white">{f.name}</div>
              <div className="text-[11px] tabular-nums text-white/30">{formatBytes(f.size)}</div>
            </button>
            <button
              type="button"
              onClick={() => download(f)}
              aria-label={`Download ${f.name}`}
              className="rounded-full p-1.5 text-white/30 hover:bg-white/[0.06] hover:text-white/75"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            {canWrite && (
              <button
                type="button"
                onClick={() => remove(f)}
                aria-label={`Remove ${f.name}`}
                className="rounded-full p-1.5 text-white/25 hover:bg-red-500/10 hover:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {files !== null && files.length === 0 && pending.length === 0 && !canWrite && (
        <div className="text-[12px] text-white/30">No files attached.</div>
      )}
    </div>
  )
}
