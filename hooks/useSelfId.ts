"use client"

/**
 * The signed-in user's id, for "is this my message" (right-hand bubble).
 * Display-only: reads the stored session or, failing that, peeks at the JWT
 * claims without verifying them. Null when unknown — messages then render
 * as someone else's, never the other way round.
 */
import { useState } from "react"
import { AuthManager } from "@/lib/authManager"
import { collabToken } from "@/lib/collabClient"

/** user_id sendiri (untuk bubble kanan ala console). Null bila tak dikenal. */
function claimSelfId(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null
  const o = obj as Record<string, unknown>
  for (const k of ["user_id", "sub", "id"]) {
    if (typeof o[k] === "string" && o[k]) return o[k] as string
  }
  return null
}

export function useSelfId(): string | null {
  const [selfId] = useState<string | null>(() => {
    try {
      if (typeof window === "undefined") return null
      const direct = AuthManager.getUserId?.()
      if (typeof direct === "string" && direct) return direct
      const u = AuthManager.getUser?.() as { user_id?: unknown; email?: unknown } | null
      if (u && typeof u.user_id === "string" && u.user_id) return u.user_id
      // Fallback: intip klaim JWT (tanpa verifikasi — hanya untuk tampilan).
      const token = collabToken()
      if (token) {
        const part = token.split(".")[1]
        if (part) {
          const b64 = part.replace(/-/g, "+").replace(/_/g, "/")
          const bin = atob(b64)
          const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
          const id = claimSelfId(JSON.parse(new TextDecoder().decode(bytes)))
          if (id) return id
        }
      }
      if (u && typeof u.email === "string" && u.email) return u.email
    } catch {
      // abaikan — pesan tampil sebagai kiri
    }
    return null
  })
  return selfId
}

