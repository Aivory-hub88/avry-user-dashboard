"use client"

import { useEffect, useRef, useState } from "react"
import type { Doc } from "@blocksuite/store"
import { DocCollection } from "@blocksuite/store"
import { createEmptyDoc } from "@blocksuite/presets"
import { effects as installBlockEffects } from "@blocksuite/blocks/effects"
import { effects as installPresetEffects } from "@blocksuite/presets/effects"
import { WebsocketProvider } from "y-websocket"
import { Check, CloudOff, LoaderCircle, Wifi } from "lucide-react"
import { collabAuthHeaders, collabWsParams } from "@/lib/collabClient"

type SaveState = "loading" | "saving" | "saved" | "offline"
type ConnectionState = "connecting" | "connected" | "disconnected"

type PageEditorElement = HTMLElement & {
  doc: Doc
  hasViewport: boolean
}

let blockSuiteEffectsInstalled = false

function ensureBlockSuiteEffects() {
  if (blockSuiteEffectsInstalled) return
  if (!customElements.get("affine-page-root")) installBlockEffects()
  if (!customElements.get("page-editor")) installPresetEffects()
  blockSuiteEffectsInstalled = true
}

function isLegacyDocument(doc: Doc) {
  // Do not use `instanceof Y.Map` here: the bundler may load a second copy
  // of Yjs, which breaks constructor identity checks. The legacy prototype
  // stores top-level `blocks` as a Y.Array (has `toArray`); BlockSuite stores
  // it as a Y.Map (has `get`, no `toArray`).
  const blocks = doc.spaceDoc.share.get("blocks") as unknown as
    | { toArray?: unknown; get?: unknown }
    | undefined
  return blocks !== undefined && typeof blocks?.toArray === "function"
}

export default function BlockSuitePageEditor({ docId, readOnly = false }: { docId: string; readOnly?: boolean }) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const providerRef = useRef<WebsocketProvider | null>(null)
  const docRef = useRef<Doc | null>(null)
  const [pageDoc, setPageDoc] = useState<Doc | null>(null)
  const [saveState, setSaveState] = useState<SaveState>("loading")
  const [connection, setConnection] = useState<ConnectionState>("connecting")
  const [blocked, setBlocked] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    let persistTimer: ReturnType<typeof setTimeout> | null = null
    let doc: Doc | null = null

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
        if (response.status !== 404) {
          if (!response.ok) throw new Error(response.status === 401 ? "Sign in required" : "Could not load this page")
          const update = new Uint8Array(await response.arrayBuffer())
          if (update.byteLength > 0) DocCollection.Y.applyUpdate(doc.spaceDoc, update)
        }

        if (isLegacyDocument(doc)) {
          doc.dispose()
          doc = null
          if (alive) {
            setBlocked(true)
            setSaveState("offline")
          }
          return
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
      if (persistTimer) clearTimeout(persistTimer)
      providerRef.current?.destroy()
      providerRef.current = null
      if (doc) doc.spaceDoc.off("update", persist)
      docRef.current?.dispose()
      docRef.current = null
      setPageDoc(null)
    }
  }, [docId, readOnly])

  useEffect(() => {
    if (!mountRef.current || !pageDoc) return
    const mount = mountRef.current
    const editor = document.createElement("page-editor") as PageEditorElement
    editor.doc = pageDoc
    editor.hasViewport = true
    mount.replaceChildren(editor)
    return () => mount.replaceChildren()
  }, [pageDoc])

  const SaveIcon = saveState === "saving" ? LoaderCircle : saveState === "offline" ? CloudOff : Check
  const saveLabel = saveState === "loading" ? "Loading" : saveState === "saving" ? "Saving" : saveState === "offline" ? "Offline" : "Saved"
  const connectionLabel = connection === "connected" ? "Connected" : connection === "connecting" ? "Connecting" : "Offline"

  if (blocked) {
    return (
      <div className="mx-auto w-full max-w-[720px] rounded-2xl border border-amber-500/20 bg-amber-500/10 p-6 text-center">
        <div className="text-[13px] font-medium text-amber-100">This page needs migration before this editor can open it.</div>
        <div className="mt-2 text-[12px] leading-relaxed text-amber-100/60">The preview is limited to new pages so the current editor and document data remain safe.</div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/35">
        <div className="flex items-center gap-2 uppercase tracking-[0.16em]">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-300/80" />
          Editor preview
        </div>
        <div className="flex items-center gap-3 normal-case tracking-normal">
          <span className="inline-flex items-center gap-1.5"><Wifi className="h-3.5 w-3.5" />{connectionLabel}</span>
          <span className="inline-flex items-center gap-1.5"><SaveIcon className={`h-3.5 w-3.5 ${saveState === "saving" || saveState === "loading" ? "animate-spin" : ""}`} />{saveLabel}</span>
        </div>
      </div>
      {error ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">{error}</div>
      ) : (
        <div className={`min-h-[560px] overflow-hidden rounded-2xl border border-line bg-[#252522] ${readOnly ? "pointer-events-none" : ""}`} aria-readonly={readOnly}>
          <div ref={mountRef} className="h-[min(72vh,760px)] min-h-[560px]" />
        </div>
      )}
      {readOnly && <div className="text-[12px] text-amber-200/70">You have viewer access. This preview is read-only.</div>}
    </div>
  )
}
