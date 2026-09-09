"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { Doc } from "@blocksuite/store"
import { DocCollection } from "@blocksuite/store"
import { createEmptyDoc } from "@blocksuite/presets"
import { ThemeProvider } from "@blocksuite/blocks"
import { ColorScheme } from "@blocksuite/affine-model"
import type { BlockStdScope } from "@blocksuite/block-std"
import { effects as installBlockEffects } from "@blocksuite/blocks/effects"
import { effects as installPresetEffects } from "@blocksuite/presets/effects"
import { WebsocketProvider } from "y-websocket"
import { Check, CheckSquare, CloudOff, FileText, Heading1, LoaderCircle, PenTool, Sparkles, Table2, Wifi } from "lucide-react"
import { collabAuthHeaders, collabWsParams } from "@/lib/collabClient"
import { buildMigratedDoc, extractLegacyDoc } from "@/lib/workspaceMigration"

export type EditorDocMode = "page" | "edgeless"

type SaveState = "loading" | "saving" | "saved" | "offline"
type ConnectionState = "connecting" | "connected" | "disconnected"

type AffineEditorContainerElement = HTMLElement & {
  doc: Doc
  mode: EditorDocMode
  switchEditor: (mode: EditorDocMode) => void
  readonly std: BlockStdScope
  readonly updateComplete: Promise<unknown>
}

type TextBearingModel = {
  text?: { length?: number }
}

/** Awareness key broadcasting doc mode (page/edgeless) across clients. */
const MODE_STATE_KEY = "aivoryDocMode"
type AwarenessModeState = { mode: EditorDocMode; at: number }

/** True once the doc holds any real content (hides the empty-state panel). */
function docHasContent(doc: Doc): boolean {
  try {
    for (const flavour of ["affine:paragraph", "affine:list", "affine:code"]) {
      const blocks = doc.getBlocksByFlavour(flavour) as Array<{ model: TextBearingModel }>
      if (blocks.some((b) => (b.model.text?.length ?? 0) > 0)) return true
    }
    return false
  } catch {
    return true // never trap the user behind a broken check
  }
}

function useDocHasContent(doc: Doc | null) {
  // Re-render on every block change; the value itself is derived during
  // render so no setState-in-effect is needed.
  const [, force] = useState(0)
  useEffect(() => {
    if (!doc) return
    const subscription = doc.slots.blockUpdated.on(() => force((x) => x + 1))
    return () => subscription.dispose()
  }, [doc])
  if (!doc) return false
  return docHasContent(doc)
}

let blockSuiteEffectsInstalled = false

function ensureBlockSuiteEffects() {
  if (blockSuiteEffectsInstalled) return
  if (!customElements.get("affine-page-root")) installBlockEffects()
  if (!customElements.get("affine-editor-container")) installPresetEffects()
  blockSuiteEffectsInstalled = true
}

export default function BlockSuitePageEditor({
  docId,
  readOnly = false,
  initialMode = "page",
  pageTitle = "",
}: {
  docId: string
  readOnly?: boolean
  initialMode?: EditorDocMode
  pageTitle?: string
}) {
  const router = useRouter()
  const mountRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<AffineEditorContainerElement | null>(null)
  const providerRef = useRef<WebsocketProvider | null>(null)
  const docRef = useRef<Doc | null>(null)
  const [pageDoc, setPageDoc] = useState<Doc | null>(null)
  const [saveState, setSaveState] = useState<SaveState>("loading")
  const [connection, setConnection] = useState<ConnectionState>("connecting")
  const [migrated, setMigrated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<EditorDocMode>(initialMode)
  // Mirror of mode for use inside websocket/awareness callbacks.
  const modeRef = useRef<EditorDocMode>(initialMode)
  const modeAtRef = useRef<number>(0)
  const appliedInitialMode = useRef(false)

  // Server is the source of truth for reloads (pg-backed mode column);
  // apply it once when meta arrives, never overriding the user's own toggle.
  useEffect(() => {
    if (appliedInitialMode.current) return
    appliedInitialMode.current = true
    modeRef.current = initialMode
    modeAtRef.current = Date.now()
    setMode(initialMode)
  }, [initialMode])

  const persistMode = (next: EditorDocMode) => {
    fetch(`/api/workspace/${docId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
      body: JSON.stringify({ mode: next }),
    }).catch(() => {})
  }

  /** User-initiated toggle: switch locally, broadcast, persist. */
  const switchMode = (next: EditorDocMode) => {
    if (next === modeRef.current || readOnly) return
    const at = Date.now()
    modeAtRef.current = at
    modeRef.current = next
    setMode(next)
    try {
      providerRef.current?.awareness.setLocalStateField(MODE_STATE_KEY, { mode: next, at } satisfies AwarenessModeState)
    } catch {}
    persistMode(next)
  }

  useEffect(() => {
    let alive = true
    let persistTimer: ReturnType<typeof setTimeout> | null = null
    let doc: Doc | null = null
    // Theme scope: capture only. The actual `data-theme="dark"` write happens
    // in the mount effect AFTER the editor connects — ThemeObserver only
    // reacts to mutations, so writing before it exists would stick on light.
    const rootDataset = document.documentElement.dataset
    const previousTheme = rootDataset.theme

    const persist = () => {
      if (!doc || readOnly) return
      if (persistTimer) clearTimeout(persistTimer)
      setSaveState("saving")
      persistTimer = setTimeout(() => {
        fetch(`/api/workspace/${docId}/doc`, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream", ...collabAuthHeaders() },
          body: DocCollection.Y.encodeStateAsUpdate(doc!.spaceDoc) as unknown as BodyInit,
        })
          .then((response) => {
            if (alive) setSaveState(response.ok ? "saved" : "offline")
          })
          .catch(() => {
            if (alive) setSaveState("offline")
          })
      }, 500)
    }

    const load = async () => {
      try {
        ensureBlockSuiteEffects()
        const empty = createEmptyDoc()
        doc = empty.doc
        doc.load()

        const response = await fetch(`/api/workspace/${docId}/doc`, { headers: collabAuthHeaders() })
        let serverBytes: Uint8Array | null = null
        if (response.status !== 404) {
          if (!response.ok) throw new Error(response.status === 401 ? "Sign in required" : "Could not load this page")
          const update = new Uint8Array(await response.arrayBuffer())
          if (update.byteLength > 0) serverBytes = update
        }

        if (serverBytes) {
          // One-way legacy migration: flat prototype blocks become a real
          // block tree (page → note → paragraph/heading/list) in a fresh doc,
          // carrying database rows along. Already-migrated state carries no
          // flat maps, so this never runs twice for the same doc.
          const legacy = extractLegacyDoc(serverBytes)
          if (legacy) {
            doc.dispose()
            doc = buildMigratedDoc(legacy)
            if (alive) setMigrated(true)
          } else {
            DocCollection.Y.applyUpdate(doc.spaceDoc, serverBytes)
          }
        }

        if (!doc.root) empty.init()
        docRef.current = doc
        doc.spaceDoc.on("update", persist)
        if (!alive) return
        setPageDoc(doc)
        setSaveState("saved")
        persist()

        const wsUrl = window.location.hostname === "localhost" ? "ws://localhost:3200" : "wss://aivory.uk/yjs"
        const provider = new WebsocketProvider(wsUrl, `workspace:${docId}`, doc.spaceDoc, {
          connect: true,
          params: collabWsParams(),
        })
        providerRef.current = provider
        provider.on("status", ({ status }: { status: "connected" | "disconnected" | "connecting" }) => {
          if (alive) setConnection(status)
        })
        // Live mode sync: broadcast our mode over the same WS channel and
        // adopt the newest remote mode (last-writer-wins). Reloads always
        // re-read the pg-backed mode via `initialMode`.
        try {
          provider.awareness.setLocalStateField(MODE_STATE_KEY, { mode: modeRef.current, at: modeAtRef.current } satisfies AwarenessModeState)
        } catch {}
        const onAwarenessChange = () => {
          try {
            // Reduce (not a closure-assigned `let`) so TS keeps the union type.
            const remote = Array.from(provider.awareness.getStates().entries())
              .filter(([clientId]) => clientId !== provider.awareness.clientID)
              .map(([, state]) => (state as Record<string, unknown>)[MODE_STATE_KEY] as AwarenessModeState | undefined)
              .filter(
                (candidate): candidate is AwarenessModeState =>
                  !!candidate &&
                  (candidate.mode === "page" || candidate.mode === "edgeless") &&
                  typeof candidate.at === "number",
              )
              .reduce<AwarenessModeState | null>(
                (acc, candidate) => (!acc || candidate.at > acc.at ? candidate : acc),
                null,
              )
            if (remote && remote.mode !== modeRef.current && remote.at > modeAtRef.current) {
              modeAtRef.current = remote.at
              modeRef.current = remote.mode
              if (alive) setMode(remote.mode)
            }
          } catch {}
        }
        provider.awareness.on("change", onAwarenessChange)
      } catch (cause) {
        doc?.dispose()
        doc = null
        if (alive) {
          setSaveState("offline")
          setError(cause instanceof Error ? cause.message : "Could not load this page")
        }
      }
    }

    void load()
    return () => {
      alive = false
      if (previousTheme === undefined) delete rootDataset.theme
      else rootDataset.theme = previousTheme
      if (persistTimer) clearTimeout(persistTimer)
      try {
        providerRef.current?.awareness.off("change", () => {})
      } catch {}
      providerRef.current?.destroy()
      providerRef.current = null
      containerRef.current = null
      if (doc) doc.spaceDoc.off("update", persist)
      docRef.current?.dispose()
      docRef.current = null
      setPageDoc(null)
    }
  }, [docId, readOnly])

  useEffect(() => {
    if (!mountRef.current || !pageDoc) return
    const mount = mountRef.current
    let editor = containerRef.current
    if (!editor) {
      editor = document.createElement("affine-editor-container") as AffineEditorContainerElement
      editor.doc = pageDoc
      editor.mode = modeRef.current
      containerRef.current = editor
      mount.replaceChildren(editor)
    }
    // Theme: the container picks its page AND edgeless palettes from
    // ThemeService signals that default to Light. The singleton
    // ThemeObserver only flips them on *mutations* of
    // documentElement[data-theme] that happen AFTER it starts observing — a
    // write issued before first render is silently missed, which is exactly
    // the stuck-light-canvas / dark-text-on-dark-shell bug. So: wait for
    // first render (observer exists by then), force a real mutation, then
    // set both signals directly (deterministic, no timing luck).
    let cancelled = false
    void (async () => {
      try {
        await editor.updateComplete
      } catch {}
      if (cancelled) return
      try {
        const root = document.documentElement
        delete root.dataset.theme
        root.dataset.theme = "dark"
      } catch {}
      try {
        const service = editor.std.get(ThemeProvider)
        service.app$.value = ColorScheme.Dark
        service.edgeless$.value = ColorScheme.Dark
      } catch {}
    })()
    return () => {
      cancelled = true
      mount.replaceChildren()
    }
  }, [pageDoc])

  // Apply mode switches (user toggle, initial meta, remote awareness) to the
  // mounted container without remounting the whole editor.
  useEffect(() => {
    const editor = containerRef.current
    if (!editor) return
    try {
      if (editor.mode !== mode) editor.switchEditor(mode)
    } catch {}
  }, [mode])

  const SaveIcon = saveState === "saving" ? LoaderCircle : saveState === "offline" ? CloudOff : Check
  const saveLabel = saveState === "loading" ? "Loading" : saveState === "saving" ? "Saving" : saveState === "offline" ? "Offline" : "Saved"
  const connectionLabel = connection === "connected" ? "Connected" : connection === "connecting" ? "Connecting" : "Offline"
  const hasContent = useDocHasContent(pageDoc)
  // Starter panel is a page-mode concept; the canvas has its own toolbar.
  const showEmptyState = !!pageDoc && !hasContent && !error && mode === "page"

  const insertStarter = (kind: "heading" | "todo") => {
    const doc = docRef.current
    if (!doc || readOnly) return
    const note = doc.getBlocksByFlavour("affine:note")[0]
    if (!note) return
    if (kind === "heading") {
      doc.addBlock("affine:paragraph", { type: "h1", text: new doc.Text("") }, note.id)
    } else {
      doc.addBlock("affine:list", { type: "todo", text: new doc.Text(""), checked: false }, note.id)
    }
  }

  const askAI = () => {
    if (readOnly) return
    try {
      const label = pageTitle.trim() || "this workspace page"
      localStorage.setItem("aivory:console:draft", `Help me write and organize ${label}: `)
    } catch {}
    router.push("/console")
  }

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-3">
      {/* Hide the container's built-in doc-title: title is pg-backed (the
          collection meta it writes to never persists in 1-doc-1-room), so
          the Big Title in the page header is the single source of truth. */}
      <style>{`[data-aivory-doc] doc-title{display:none!important}`}</style>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/35">
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-[0.16em]">Editor preview</span>
          {!readOnly && pageDoc && (
            <div className="flex items-center gap-1 rounded-full bg-white/[0.04] p-1 normal-case tracking-normal">
              <button
                onClick={() => switchMode("page")}
                title="Page mode"
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] ${mode === "page" ? "bg-white text-black" : "text-white/40 hover:text-white/70"}`}
              >
                <FileText className="h-3.5 w-3.5" />Page
              </button>
              <button
                onClick={() => switchMode("edgeless")}
                title="Edgeless canvas mode"
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] ${mode === "edgeless" ? "bg-white text-black" : "text-white/40 hover:text-white/70"}`}
              >
                <PenTool className="h-3.5 w-3.5" />Edgeless
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 normal-case tracking-normal">
          <span className="inline-flex items-center gap-1.5"><Wifi className="h-3.5 w-3.5" />{connectionLabel}</span>
          <span className="inline-flex items-center gap-1.5"><SaveIcon className={`h-3.5 w-3.5 ${saveState === "saving" || saveState === "loading" ? "animate-spin" : ""}`} />{saveLabel}</span>
        </div>
      </div>
      {migrated && !error && (
        <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 px-4 py-2.5 text-[12px] text-violet-200/80">
          Converted to blocks — your notes, headings, and tasks are preserved.
        </div>
      )}
      {showEmptyState && (
        <div className="rounded-2xl border border-line bg-white/[0.025] p-5">
          {readOnly ? (
            <div className="py-2 text-center text-[13px] text-white/35">This page is empty.</div>
          ) : (
            <>
              <div className="text-[13px] font-medium text-white/70">Start with a simple idea</div>
              <div className="mt-1 text-[12px] text-white/35">
                Notes, tasks, and ideas live here. Type <span className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-[11px] text-white/60">/</span> anywhere for commands.
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => insertStarter("heading")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/60 hover:bg-white/[0.08] hover:text-white/85"
                >
                  <Heading1 className="h-3.5 w-3.5" />Add heading
                </button>
                <button
                  onClick={() => insertStarter("todo")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/60 hover:bg-white/[0.08] hover:text-white/85"
                >
                  <CheckSquare className="h-3.5 w-3.5" />Add to-do
                </button>
                <button
                  onClick={() => switchMode("edgeless")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/60 hover:bg-white/[0.08] hover:text-white/85"
                >
                  <PenTool className="h-3.5 w-3.5" />Edgeless canvas
                </button>
                <button
                  onClick={askAI}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/60 hover:bg-white/[0.08] hover:text-white/85"
                >
                  <Sparkles className="h-3.5 w-3.5" />With AI
                </button>
                <a
                  href={`/workspace/${docId}?view=database`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/60 hover:bg-white/[0.08] hover:text-white/85"
                >
                  <Table2 className="h-3.5 w-3.5" />Open data
                </a>
              </div>
            </>
          )}
        </div>
      )}
      {error ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">{error}</div>
      ) : (
        // NOTE: no `overflow-hidden` here on purpose. BlockSuite renders the
        // slash menu, drag handle, and format bar as overlays inside the
        // editor tree; a clipping ancestor cuts them off like AFFiNE would not.
        <div data-theme="dark" data-aivory-doc className={`min-h-[560px] rounded-2xl border border-line bg-[#252522] ${readOnly ? "pointer-events-none" : ""}`} aria-readonly={readOnly}>
          <div ref={mountRef} className="h-[min(72vh,760px)] min-h-[560px]" />
        </div>
      )}
      {readOnly && <div className="text-[12px] text-amber-200/70">You have viewer access. This preview is read-only.</div>}
    </div>
  )
}
