'use client'

import { useEffect, useState } from 'react'

export interface TeamAccessState {
  restricted: boolean
  modules: string[]
}

const OPEN: TeamAccessState = { restricted: false, modules: [] }

let cached: TeamAccessState | null = null
let inflight: Promise<TeamAccessState> | null = null

function fetchAccess(): Promise<TeamAccessState> {
  if (cached) return Promise.resolve(cached)
  inflight ??= fetch('/api/workspaces/access', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : OPEN))
    .then((j: TeamAccessState) => (cached = j && Array.isArray(j.modules) ? j : OPEN))
    .catch(() => OPEN)
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** Team grants for the signed-in user; `OPEN` until loaded or when unrestricted. */
export function useTeamAccess(): TeamAccessState {
  const [state, setState] = useState<TeamAccessState>(cached ?? OPEN)
  useEffect(() => {
    let live = true
    const load = () => {
      cached = null
      void fetchAccess().then((a) => live && setState(a))
    }
    void fetchAccess().then((a) => live && setState(a))
    window.addEventListener('authManager:login', load)
    window.addEventListener('authManager:logout', load)
    return () => {
      live = false
      window.removeEventListener('authManager:login', load)
      window.removeEventListener('authManager:logout', load)
    }
  }, [])
  return state
}
