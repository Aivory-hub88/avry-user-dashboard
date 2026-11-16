"use client"

/** Browser helpers for the WhatsApp routes. Keys are only ever sent to the server, never read back. */
import { useCallback, useEffect, useState } from "react"
import { BASE_PATH } from "@/lib/asset"
import { authedFetch } from "@/lib/deployAuth"

export type WaStatus = { connected: boolean; mode: "own" | "aivory" | null; phone: string | null }

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
  connect: async (b: { api_key: string; phone_number_id: string; display_phone?: string }): Promise<void> => {
    const r = await authedFetch(`${BASE_PATH}/api/whatsapp/connection`, { method: "POST", body: JSON.stringify(b) })
    if (!r.ok) throw new Error((await json(r)).error ?? "Could not connect. Try again.")
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
