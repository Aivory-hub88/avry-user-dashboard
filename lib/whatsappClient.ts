"use client"

/** Browser helpers for the WhatsApp routes. Keys are only ever sent to the server, never read back. */
import { useCallback, useEffect, useState } from "react"
import { BASE_PATH } from "@/lib/asset"
import { authedFetch } from "@/lib/deployAuth"
import type { ProviderId, WaTemplate } from "@/lib/whatsapp/types"

export type WaStatus = { connected: boolean; mode: "own" | "aivory" | null; provider: ProviderId | null; phone: string | null }

async function json(r: Response): Promise<{ error?: string; code?: string } & Record<string, unknown>> {
  try {
    return await r.json()
  } catch {
    return {}
  }
}

/** An error with the server's machine-readable `code` (e.g. "window_closed"). */
export class WaError extends Error {
  constructor(message: string, public code?: string) {
    super(message)
  }
}

export type WaAgentOption = { type: string; name: string; title: string }
export type ReplyMode = "approval" | "autonomous"
export type WaSettings = { draft_replies: boolean; agent: string | null; reply_mode: ReplyMode; agents: WaAgentOption[]; assistant_available: boolean }
export type WaDraft = { text: string; createdAt: string; writer: string | null; note: string | null }

export type TemplateListing = { templates: WaTemplate[]; hidden: number } | { unsupported: string }

export const waApi = {
  status: async (): Promise<WaStatus> => {
    const r = await authedFetch(`${BASE_PATH}/api/whatsapp/status`)
    if (!r.ok) throw new Error("status")
    return (await r.json()) as WaStatus
  },
  /** `setup` lists what to do in the provider's console (empty when Aivory wired the webhook itself). */
  connect: async (b: { provider: ProviderId; credentials: Record<string, string>; display_phone?: string }): Promise<{ setup: string[] }> => {
    const r = await authedFetch(`${BASE_PATH}/api/whatsapp/connection`, { method: "POST", body: JSON.stringify(b) })
    const j = await json(r)
    if (!r.ok) throw new Error(j.error ?? "Could not connect. Try again.")
    return { setup: Array.isArray(j.setup) ? (j.setup as string[]) : [] }
  },
  disconnect: async (): Promise<void> => {
    const r = await authedFetch(`${BASE_PATH}/api/whatsapp/connection`, { method: "DELETE" })
    if (!r.ok) throw new Error((await json(r)).error ?? "Could not disconnect. Try again.")
  },
  send: async (contactId: string, text: string): Promise<{ logged: boolean }> => {
    const r = await authedFetch(`${BASE_PATH}/api/whatsapp/send`, { method: "POST", body: JSON.stringify({ contact_id: contactId, text }) })
    const j = await json(r)
    if (!r.ok) throw new WaError(j.error ?? "Could not send. Try again.", j.code)
    return { logged: j.logged !== false }
  },
  settings: async (): Promise<WaSettings> => {
    const r = await authedFetch(`${BASE_PATH}/api/whatsapp/settings`)
    if (!r.ok) throw new Error("settings")
    return (await r.json()) as WaSettings
  },
  /** Change the drafts switch and/or which agent writes them (`null` clears the agent). */
  saveSettings: async (change: { draft_replies?: boolean; agent?: string | null; reply_mode?: ReplyMode }): Promise<void> => {
    const r = await authedFetch(`${BASE_PATH}/api/whatsapp/settings`, { method: "PUT", body: JSON.stringify(change) })
    if (!r.ok) throw new Error((await json(r)).error ?? "Could not save. Try again.")
  },
  draft: async (contactId: string): Promise<WaDraft | null> => {
    const r = await authedFetch(`${BASE_PATH}/api/whatsapp/draft?contact_id=${encodeURIComponent(contactId)}`)
    if (!r.ok) return null
    return ((await r.json()) as { draft: WaDraft | null }).draft
  },
  discardDraft: async (contactId: string): Promise<void> => {
    await authedFetch(`${BASE_PATH}/api/whatsapp/draft?contact_id=${encodeURIComponent(contactId)}`, { method: "DELETE" })
  },
  templates: async (): Promise<TemplateListing> => {
    const r = await authedFetch(`${BASE_PATH}/api/whatsapp/templates`)
    const j = await json(r)
    if (!r.ok) throw new WaError(j.error ?? "Could not load templates. Try again.", j.code)
    if (j.code === "unsupported") return { unsupported: j.error ?? "Templates are not supported for this provider yet." }
    return { templates: (j.templates as WaTemplate[]) ?? [], hidden: Number(j.hidden ?? 0) }
  },
  sendTemplate: async (contactId: string, t: { name: string; language: string }, params: string[]): Promise<{ logged: boolean }> => {
    const r = await authedFetch(`${BASE_PATH}/api/whatsapp/send-template`, { method: "POST", body: JSON.stringify({ contact_id: contactId, name: t.name, language: t.language, params }) })
    const j = await json(r)
    if (!r.ok) throw new WaError(j.error ?? "Could not send the template. Try again.", j.code)
    return { logged: j.logged !== false }
  },
}

/** `null` while loading or when the status can't be read (the feature then simply stays hidden). */
export function useWhatsappStatus(): { status: WaStatus | null; refresh: () => void } {
  const [status, setStatus] = useState<WaStatus | null>(null)
  const refresh = useCallback(() => {
    waApi.status().then(setStatus, () => setStatus(null))
  }, [])
  useEffect(() => {
    refresh()
  }, [refresh])
  return { status, refresh }
}
