"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { Doc } from "@blocksuite/store"
import { DocCollection } from "@blocksuite/store"
import { createEmptyDoc } from "@blocksuite/presets"
import { getThemeObserver, ThemeProvider } from "@blocksuite/blocks"
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

function extractDocText(doc: Doc | null): string {
  if (!doc) return ""
  try {
    const parts: string[] = []
    for (const flavour of ["affine:paragraph", "affine:list", "affine:code", "affine:heading" as string]) {
      const blocks = doc.getBlocksByFlavour(flavour) as Array<{ model: { text?: { toString?: () => string } | string } }>
      for (const b of blocks) {
        const t = b.model.text
        const s = typeof t === "string" ? t : typeof t?.toString === "function" ? t.toString() : ""
        if (s && s.trim()) parts.push(s.trim())
      }
    }
    // Fallback: also collect via store's block map if flavour filter missed
    if (parts.length === 0) {
      try {
        const all = doc.getBlocksByFlavour("affine:paragraph") as Array<{ model: { text?: unknown } }>
        for (const b of all) {
          const s = (b.model.text as { toString?: () => string } | undefined)?.toString?.() ?? ""
          if (s.trim()) parts.push(s.trim())
        }
      } catch {}
    }
    return parts.join("\n").slice(0, 6000)
  } catch {
    return ""
  }
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
  outlineOpen = false,
  edgelessTheme = "dark",
  onDocTextChange,
  onModeChange,
}: {
  docId: string
  readOnly?: boolean
  initialMode?: EditorDocMode
  pageTitle?: string
  outlineOpen?: boolean
  edgelessTheme?: "light" | "dark"
  onDocTextChange?: (text: string) => void
  onModeChange?: (mode: EditorDocMode) => void
}) {
  const router = useRouter()
  const mountRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<AffineEditorContainerElement | null>(null)
  const outlineMountRef = useRef<HTMLDivElement | null>(null)
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
  // Last mode the canvas tool/focus was synced for. Tool reset ("default")
  // must ONLY run on real mode transitions — re-running it on every
  // edgelessTheme toggle yanks the tool mid-gesture and can strand an
  // in-progress drag/selection (objects stuck together, clicks select nothing).
  const toolSyncedModeRef = useRef<EditorDocMode | null>(null)
  // True while the primary button is held on the canvas. A right-click in
  // this window opens the OS context menu, breaks pointer capture, and the
  // missed pointerup strands BlockSuite in persistent drag mode (upstream
  // AFFiNE #5704 family: object glued to cursor, can't drop, all move
  // together). Suppress the menu only in that window — normal right-click
  // menus keep working.
  const leftDownRef = useRef(false)
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
    onModeChange?.(initialMode)
  }, [initialMode, onModeChange])

  const persistMode = (next: EditorDocMode) => {
    fetch(`/api/workspace/${docId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...collabAuthHeaders() },
      body: JSON.stringify({ mode: next }),
    }).catch(() => {})
  }

  /** Focus the canvas only when focus is outside it — and only from direct
   * canvas interaction or fresh mount. NEVER from timers/effects mid-session:
   * yanking focus out of an open shape/mindmap text editor breaks its
   * blur→unmount flow (upstream #9052 family) leaving a phantom cursor and a
   * stuck `editing` flag that disables all canvas dragging. Space→Hand does
   * not need this: BlockSuite listens for Space on `document`. */
  const focusEditorIfOutside = () => {
    try {
      const editor = containerRef.current as unknown as HTMLElement | null
      if (!editor) return
      const active = document.activeElement
      if (active && editor.contains(active)) return
      editor.focus()
    } catch {}
  }

  /** Suppress the OS context menu only while a left-drag is in progress
   * (see leftDownRef). Prevents the missed-pointerup stuck-drag strand. */
  const guardDragContextMenu = (e: { preventDefault(): void; stopPropagation(): void }) => {
    if (leftDownRef.current) {
      e.preventDefault()
      e.stopPropagation()
    }
  }
  /** User-initiated toggle: switch locally, broadcast, persist. */
  const switchMode = (next: EditorDocMode) => {
    if (next === modeRef.current || readOnly) return
    const at = Date.now()
    modeAtRef.current = at
    modeRef.current = next
    setMode(next)
    onModeChange?.(next)
    try {
      providerRef.current?.awareness.setLocalStateField(MODE_STATE_KEY, { mode: next, at } satisfies AwarenessModeState)
    } catch {}
    persistMode(next)
  }

  useEffect(() => {
    let alive = true
    let persistTimer: ReturnType<typeof setTimeout> | null = null
    // Full-state PUT storm guard: sustained dragging fires doc updates at
    // pointermove rate; without pacing, ~100KB PUTs pile up (overlap and race
    // each other) and the main thread + pg saturate — the "hang after a
    // while". Coalesce: at most one timer + one in-flight PUT; bursts collapse
    // into a trailing flush. Server REPLACES the blob (no merge), so every
    // PUT must stay full-state — pacing, not diffing, is the fix.
    let persistInFlight = false
    let persistDirty = false
    let doc: Doc | null = null
    // Theme scope: capture only. The actual `data-theme="dark"` write happens
    // in the mount effect AFTER the editor connects — ThemeObserver only
    // reacts to mutations, so writing before it exists would stick on light.
    const rootDataset = document.documentElement.dataset
    const previousTheme = rootDataset.theme

    const persist = () => {
      if (!doc || readOnly) return
      persistDirty = true
      // A pending timer or an in-flight PUT already covers this change —
      // it will flush trailing edits on completion instead of piling up.
      if (persistTimer || persistInFlight) return
      // Background tabs still receive WS updates; persist them rarely so a
      // hidden tab never storms the server.
      const delay = typeof document !== "undefined" && document.hidden ? 10000 : 2000
      setSaveState("saving")
      persistTimer = setTimeout(() => {
        persistTimer = null
        if (!alive || !doc || persistInFlight) return
        persistInFlight = true
        persistDirty = false
        let body: Uint8Array | null = null
        try {
          body = DocCollection.Y.encodeStateAsUpdate(doc!.spaceDoc) as unknown as Uint8Array
        } catch {
          persistInFlight = false
          return
        }
        fetch(`/api/workspace/${docId}/doc`, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream", ...collabAuthHeaders() },
          body: body as unknown as BodyInit,
        })
          .then((response) => {
            if (alive) setSaveState(response.ok ? "saved" : "offline")
          })
          .catch(() => {
            if (alive) setSaveState("offline")
          })
          .finally(() => {
            persistInFlight = false
            // Edits that landed mid-flight get one trailing flush, then quiet.
            if (alive && persistDirty) persist()
          })
      }, delay)
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
              if (alive) {
                setMode(remote.mode)
                onModeChange?.(remote.mode)
              }
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

  // Hide the empty template gallery (vanilla BlockSuite ships with
  // builtInTemplates = [] so the panel is just an empty card). The button
  // lives inside shadow roots (edgeless toolbar is not light DOM), so we
  // need a deep traversal that pierces shadowRoot.
  const hideEmptyTemplateUI = () => {
    const deepHide = (root: Element | Document | ShadowRoot) => {
      try {
        const els = (root as Document).querySelectorAll?.("edgeless-template-button, edgeless-templates-panel") ?? []
        for (const el of Array.from(els) as HTMLElement[]) el.style.display = "none"
        // Traverse shadow roots
        const all = (root as Element).querySelectorAll?.("*") ?? []
        for (const el of Array.from(all) as HTMLElement[]) {
          const shadow = (el as unknown as { shadowRoot?: ShadowRoot }).shadowRoot
          if (shadow) deepHide(shadow)
        }
      } catch {}
    }
    try {
      deepHide(document)
    } catch {}
    try {
      const c = containerRef.current as unknown as HTMLElement | null
      if (c) deepHide(c)
      // Also check the edgeless root's shadow if it exists
      const edgelessRoot = c?.querySelector("affine-edgeless-root") as unknown as { shadowRoot?: ShadowRoot } | null
      if (edgelessRoot?.shadowRoot) deepHide(edgelessRoot.shadowRoot)
    } catch {}
  }

  // Expose doc text to parent (AI panel) whenever blocks change.
  useEffect(() => {
    if (!pageDoc || !onDocTextChange) return
    const push = () => onDocTextChange(extractDocText(pageDoc))
    push()
    const sub = pageDoc.slots.blockUpdated.on(push)
    return () => sub.dispose()
  }, [pageDoc, onDocTextChange])

  // Allow parent (AI panel) to insert a block — exposed imperatively on the container.
  useEffect(() => {
    if (!pageDoc) return
    const editor = containerRef.current
    if (editor) {
      ;(editor as unknown as Record<string, unknown>).__aivoryInsert = (text: string) => {
        if (readOnly) return
        const note = pageDoc.getBlocksByFlavour("affine:note")[0]
        if (!note) return
        const lines = text.split("\n").slice(0, 30)
        for (const line of lines) {
          const t = line.trim()
          if (!t) continue
          if (t.startsWith("- ") || t.startsWith("• ")) {
            pageDoc.addBlock("affine:list", { type: "bulleted", text: new pageDoc.Text(t.slice(2)) }, note.id)
          } else {
            pageDoc.addBlock("affine:paragraph", { type: "text", text: new pageDoc.Text(t) }, note.id)
          }
        }
      }
    }
  }, [pageDoc, readOnly])

  useEffect(() => {
    if (!mountRef.current || !pageDoc) return
    const mount = mountRef.current
    let editor = containerRef.current
    if (!editor) {
      editor = document.createElement("affine-editor-container") as AffineEditorContainerElement
      // Ensure Space → Hand and drag work: editor must be focusable and autofocus
      try {
        ;(editor as unknown as Record<string, unknown>).autofocus = true
      } catch {}
      editor.doc = pageDoc
      editor.mode = modeRef.current
      containerRef.current = editor
      mount.replaceChildren(editor)
      // Focus so Space/Hand and keyboard shortcuts are captured
      try {
        ;(editor as HTMLElement).setAttribute("tabindex", "0")
        setTimeout(() => focusEditorIfOutside(), 50)
      } catch {}
    } else {
      // Reuse existing container (page already mounted) — do NOT focus here.
      // A blind focus steals the caret from an open text editor (see helper).
      // Native mousedown already focuses the container (tabindex=0) on click.
      // Re-attach if the effect cleanup detached it (re-runs on theme toggle)
      // — otherwise the canvas goes blank with a live-looking shell.
      try {
        if (!mount.contains(editor)) mount.replaceChildren(editor)
      } catch {}
    }
    // Theme: the container picks its page AND edgeless palettes from
    // ThemeService signals that default to Light and track the singleton
    // ThemeObserver (which only flips on *mutations* of
    // documentElement[data-theme] after it exists). A write before first
    // render is silently missed → stuck-light canvas + dark-text-on-dark
    // shell + white template panel. Fix at two levels: the global observer
    // (so every lazily-created panel/toolbar inherits dark) AND the current
    // container's service (so the page that just mounted flips immediately).
    let cancelled = false
    void (async () => {
      try {
        await editor.updateComplete
      } catch {}
      if (cancelled) return
      // 1) Global observer — future ThemeService instances (e.g. template
      //    panel created on toolbar click) read this fallback.
      try {
        getThemeObserver().theme$.value = ColorScheme.Dark
      } catch {}
      try {
        const root = document.documentElement
        delete root.dataset.theme
        root.dataset.theme = "dark"
      } catch {}
      // 2) Current container's service — page + edgeless in this mount.
      try {
        const service = editor.std.get(ThemeProvider)
        service.app$.value = ColorScheme.Dark
        service.edgeless$.value = edgelessTheme === "light" ? ColorScheme.Light : ColorScheme.Dark
      } catch {}
      hideEmptyTemplateUI()
      // Ensure edgeless default tool is Select (movable) — Hand is via Space.
      // Mount is fresh (no gesture in progress) so setting it here is safe.
      try {
        if (modeRef.current === "edgeless") {
          const gfx = (editor.std as unknown as { get: (id: unknown) => unknown }).get?.("GfxController" as unknown) as unknown as { tool?: { setTool: (n: string) => void } } | null
          const tool = (gfx as unknown as { tool?: unknown })?.tool as { setTool?: (n: string) => void } | undefined
          tool?.setTool?.("default")
          // Fallback: try via getOptional
          if (!tool) {
            const alt = (editor.std as unknown as { getOptional?: (id: unknown) => unknown }).getOptional?.("GfxController" as unknown) as unknown as { tool?: { setTool: (n: string) => void } } | null
            alt?.tool?.setTool?.("default")
          }
          toolSyncedModeRef.current = "edgeless"
        }
      } catch {}
      // No focus steal here (see helper): theme application must not touch
      // focus — the user may be typing in a node text editor right now.
    })()
    const t1 = window.setTimeout(hideEmptyTemplateUI, 400)
    const t2 = window.setTimeout(hideEmptyTemplateUI, 1200)
    return () => {
      cancelled = true
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      mount.replaceChildren()
    }
  }, [pageDoc, edgelessTheme])

  // Apply mode switches (user toggle, initial meta, remote awareness) to the
  // mounted container without remounting the whole editor.
  useEffect(() => {
    const editor = containerRef.current
    if (!editor) return
    try {
      if (editor.mode !== mode) editor.switchEditor(mode)
    } catch {}
    // A mode switch can spin up a new std/scope inside the container; its
    // ThemeService is seeded from the (now-dark) observer, but re-assert
    // dark on this container too so there's no one-frame flash of white.
    try {
      getThemeObserver().theme$.value = ColorScheme.Dark
    } catch {}
    try {
      const service = editor.std.get(ThemeProvider)
      service.app$.value = ColorScheme.Dark
      service.edgeless$.value = edgelessTheme === "light" ? ColorScheme.Light : ColorScheme.Dark
      document.documentElement.dataset.theme = "dark"
    } catch {}
    // Toolbar is rebuilt on switch; hide the empty template entry again.
    hideEmptyTemplateUI()
    window.setTimeout(hideEmptyTemplateUI, 200)
    window.setTimeout(hideEmptyTemplateUI, 800)
    // Reset to Select ONLY on a real mode transition into edgeless. A pure
    // edgelessTheme toggle must not touch the tool or focus — the user may be
    // mid-drag / mid-text-edit and yanking either strands the gesture.
    const transitioned = toolSyncedModeRef.current !== mode
    toolSyncedModeRef.current = mode
    // Ensure Select is active in edgeless (movable), Hand via Space
    if (transitioned) {
      try {
        if (mode === "edgeless") {
          const gfx = (editor.std as unknown as { get: (id: unknown) => unknown }).get?.("GfxController" as unknown) as unknown as { tool?: { setTool: (n: string) => void } } | null
          const tool = (gfx as unknown as { tool?: unknown })?.tool as { setTool?: (n: string) => void } | undefined
          tool?.setTool?.("default")
          if (!tool) {
            const alt = (editor.std as unknown as { getOptional?: (id: unknown) => unknown }).getOptional?.("GfxController" as unknown) as unknown as { tool?: { setTool: (n: string) => void } } | null
            alt?.tool?.setTool?.("default")
          }
        }
      } catch {}
      // No focus steal here either (see helper) — a mode effect re-run must
      // never yank the caret out of an open text editor. Canvas mousedown
      // focuses natively via tabindex; Space works via document listener.
    }
  }, [mode, edgelessTheme])

  // React to edgelessTheme prop changes (from Properties panel) without remounting
  useEffect(() => {
    const editor = containerRef.current
    if (!editor) return
    try {
      const service = editor.std.get(ThemeProvider)
      service.edgeless$.value = edgelessTheme === "light" ? ColorScheme.Light : ColorScheme.Dark
      // Force a re-render of the edgeless viewport's data-theme attribute
      // by toggling the mode briefly if currently in edgeless
      if (modeRef.current === "edgeless") {
        // No need to switchEditor, just ensure theme is applied; the
        // edgeless viewport reads edgeless$ directly.
      }
    } catch {}
  }, [edgelessTheme])

  // Outline panel — mount `affine-outline-panel` next to the editor when toggled on.
  // Global reset for the left-drag flag (contextmenu guard): window-level
  // pointerup/blur always fire even when the canvas misses them.
  useEffect(() => {
    const reset = () => {
      leftDownRef.current = false
    }
    window.addEventListener("pointerup", reset, true)
    window.addEventListener("pointercancel", reset, true)
    window.addEventListener("blur", reset)
    return () => {
      window.removeEventListener("pointerup", reset, true)
      window.removeEventListener("pointercancel", reset, true)
      window.removeEventListener("blur", reset)
    }
  }, [])  // The panel reads headings from the editor's doc and is already theme-aware (inherits
  // the global dark observer we force above). No extra deps.
  useEffect(() => {
    if (!outlineOpen || !pageDoc || mode !== "page") return
    const mount = outlineMountRef.current
    const editor = containerRef.current
    if (!mount || !editor) return
    let cancelled = false
    void (async () => {
      try {
        await editor.updateComplete
      } catch {}
      if (cancelled || !outlineOpen) return
      try {
        const panel = document.createElement("affine-outline-panel") as HTMLElement & { editor: AffineEditorContainerElement }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(panel as unknown as Record<string, unknown>).editor = editor
        mount.replaceChildren(panel)
        // Force dark inside the panel (it uses its own ThemeService seeded from observer).
        try {
          getThemeObserver().theme$.value = ColorScheme.Dark
        } catch {}
      } catch {}
    })()
    return () => {
      cancelled = true
      try {
        mount.replaceChildren()
      } catch {}
    }
  }, [outlineOpen, pageDoc, mode])

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

  const isEdgeless = mode === "edgeless"
  return (
    <div className={isEdgeless ? "flex h-full w-full flex-1 flex-col gap-2" : "mx-auto flex w-full max-w-[960px] flex-col gap-3"}>
      {/* Hide the container's built-in doc-title: title is pg-backed (the
          collection meta it writes to never persists in 1-doc-1-room), so
          the Big Title in the page header is the single source of truth.
          Hide the template-gallery button too — vanilla BlockSuite ships
          with no built-in templates (builtInTemplates is empty) so the
          panel would just be an empty white card. */}
      <style>{`[data-aivory-doc] doc-title,[data-aivory-doc] edgeless-template-button{display:none!important}`}</style>
      <style>{`affine-outline-panel{--affine-background-primary-color:#252522;--affine-background-secondary-color:#1e1e1c;}`}</style>
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
        // NOTE: no `overflow-hidden` on the page wrapper on purpose — BlockSuite
        // renders slash menu, drag handle, and format bar as overlays inside the
        // editor tree; a clipping ancestor cuts them off like AFFiNE would not.
        // For edgeless we let the canvas fill the available flex space.
        <div className={`flex gap-3 ${isEdgeless ? "flex-1 min-h-0" : ""} ${outlineOpen && mode === "page" ? "" : ""}`}>
          <div
            data-theme="dark"
            data-aivory-doc
            className={`${isEdgeless ? "flex flex-1 flex-col min-h-0" : "min-h-[560px] flex-1"} rounded-2xl border border-line bg-[#252522] ${readOnly ? "pointer-events-none" : ""}`}
            aria-readonly={readOnly}
            onPointerDown={(e) => {
              if (e.button === 0) leftDownRef.current = true
              // Interaction-driven focus only, and never when the press lands
              // inside a text editor — stealing that focus breaks typing and
              // the editor's blur→unmount flow (see helper).
              try {
                const t = e.target as unknown as HTMLElement | null
                const inTextUI = !!t?.closest?.(
                  "edgeless-shape-text-editor, edgeless-text-editor, edgeless-connector-label-editor, input, textarea, [contenteditable]",
                )
                if (inTextUI) return
                focusEditorIfOutside()
                // Clear a stale native caret: window.getSelection() ranges
                // survive canvas clicks (BlockSuite only resets them on
                // empty-canvas clicks), painting a phantom cursor in the last
                // edited note while another node is selected. Legit caret
                // placement re-happens later on click/dblclick, so clearing
                // here (pointerdown) is ordering-safe.
                try {
                  window.getSelection()?.removeAllRanges()
                } catch {}
              } catch {}
            }}
            onPointerUp={() => {
              leftDownRef.current = false
            }}
            onPointerCancel={() => {
              leftDownRef.current = false
            }}
            onPointerLeave={() => {
              leftDownRef.current = false
            }}
            onContextMenu={guardDragContextMenu}
          >
            <div ref={mountRef} className={isEdgeless ? "flex-1 min-h-0 h-full" : "h-[min(72vh,760px)] min-h-[560px]"} />
          </div>
          {outlineOpen && mode === "page" && (
            <div className="hidden w-[260px] shrink-0 overflow-hidden rounded-2xl border border-line bg-[#1e1e1c] lg:block">
              <div ref={outlineMountRef} className="h-[min(72vh,760px)] min-h-[560px] overflow-y-auto" />
            </div>
          )}
        </div>
      )}
      {readOnly && <div className="text-[12px] text-amber-200/70">You have viewer access. This preview is read-only.</div>}
    </div>
  )
}
