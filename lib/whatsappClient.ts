"use client"

/** Browser helpers for the WhatsApp routes. Keys are only ever sent to the server, never read back. */
import { useCallback, useEffect, useState } from "react"
import { BASE_PATH } from "@/lib/asset"
import { authedFetch } from "@/lib/deployAuth"
import type { ProviderId } from "@/lib/whatsapp/types"

export type WaStatus = { connected: boolean; mode: "own" | "aivory" | null; provider: ProviderId | null; phone: string | null }

async function json(r: Response): Promise<{ error?: string; code?: string } & Record<string, unknown>> {
  try {
    return await r.json()
  } catch {
    return {}
  }
}

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
    if (!r.ok) throw new Error(j.error ?? "Could not send. Try again.")
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
