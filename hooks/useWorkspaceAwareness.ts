"use client"
/**
 * One shared Yjs awareness connection per workspace, reference-counted
 * across every component that calls this hook.
 *
 * AgentRail and MissionControl each used to open their own `WebsocketProvider`
 * to the identical `workspace:${id}` room whenever both were mounted at once
 * — the rail is always mounted, and Mission Control mounts on top of it when
 * opened — doubling the live connection for zero benefit, since both only
 * ever showed the same peer list. This hook keeps exactly one `Y.Doc`/
 * provider per workspace alive for as long as at least one caller wants it.
 */
import { useEffect, useState } from "react"
import * as Y from "yjs"
import { WebsocketProvider } from "y-websocket"
import { collabWsParams } from "@/lib/collabClient"

export interface AwarenessPeer {
  name: string
  color: string
  agentType: string
}

interface Entry {
  doc: Y.Doc
  provider: WebsocketProvider
  refCount: number
  listeners: Set<(peers: AwarenessPeer[]) => void>
  peers: AwarenessPeer[]
}

const registry = new Map<string, Entry>()

function wsUrl(): string {
  return typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "ws://localhost:3200"
    : "wss://aivory.uk/yjs"
}

function acquire(workspaceId: string): Entry {
  const existing = registry.get(workspaceId)
  if (existing) {
    existing.refCount += 1
    return existing
  }
  const doc = new Y.Doc()
  const entry: Entry = {
    doc,
    provider: null as unknown as WebsocketProvider,
    refCount: 1,
    listeners: new Set(),
    peers: [],
  }
  try {
    entry.provider = new WebsocketProvider(wsUrl(), `workspace:${workspaceId}`, doc, {
      connect: true,
      params: collabWsParams(),
    })
    const update = () => {
      entry.peers = Array.from(entry.provider.awareness.getStates().values())
        .map((s: unknown) => (s as { user?: AwarenessPeer })?.user)
        .filter(Boolean) as AwarenessPeer[]
      entry.listeners.forEach((l) => l(entry.peers))
    }
    entry.provider.awareness.on("change", update)
  } catch {
    // Same best-effort posture the two call sites had before this hook —
    // presence is a nice-to-have, never something worth failing the page for.
  }
  registry.set(workspaceId, entry)
  return entry
}

function release(workspaceId: string) {
  const entry = registry.get(workspaceId)
  if (!entry) return
  entry.refCount -= 1
  if (entry.refCount <= 0) {
    entry.provider?.destroy()
    entry.doc.destroy()
    registry.delete(workspaceId)
  }
}

export function useWorkspaceAwareness(workspaceId: string | null): AwarenessPeer[] {
  const [peers, setPeers] = useState<AwarenessPeer[]>([])

  useEffect(() => {
    if (!workspaceId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPeers([])
      return
    }
    const entry = acquire(workspaceId)
    setPeers(entry.peers)
    entry.listeners.add(setPeers)
    return () => {
      entry.listeners.delete(setPeers)
      release(workspaceId)
    }
  }, [workspaceId])

  return peers
}
