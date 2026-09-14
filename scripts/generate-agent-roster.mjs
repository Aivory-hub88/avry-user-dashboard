#!/usr/bin/env node
/**
 * Regenerates lib/agentRoster.generated.ts from the live Aivory backend's
 * agent roster (GET /api/v1/agent-roster). Runs automatically before
 * `npm run dev` / `npm run build` (see package.json's predev/prebuild) and
 * can be run manually: `npm run generate:agent-roster`.
 *
 * Never fails the build on a network error -- if the fetch fails, this
 * prints a warning and leaves the existing generated file untouched, so a
 * stale-but-valid roster survives a network blip, offline dev, or a
 * not-yet-deployed backend change instead of blocking the whole build. Only
 * exits non-zero if there's no existing file to fall back to (e.g. a fresh
 * clone with no network at all).
 */
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_FILE = path.join(__dirname, '..', 'lib', 'agentRoster.generated.ts')
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend.aivory.id'
const ROSTER_URL = `${BACKEND_URL}/api/v1/agent-roster`

async function main() {
  let agents
  try {
    const res = await fetch(ROSTER_URL, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    agents = body.agents
    if (!Array.isArray(agents) || agents.length === 0) throw new Error('empty roster response')
  } catch (err) {
    if (existsSync(OUT_FILE)) {
      console.warn(
        `[generate-agent-roster] could not fetch ${ROSTER_URL} (${err.message}) -- keeping existing lib/agentRoster.generated.ts`,
      )
      return
    }
    console.error(
      `[generate-agent-roster] could not fetch ${ROSTER_URL} (${err.message}) and there's no existing generated file to fall back to.`,
    )
    process.exit(1)
  }

  const entries = agents
    .map(
      (a) =>
        `  { type: ${JSON.stringify(a.agent_type)}, name: ${JSON.stringify(a.name)}, title: ${JSON.stringify(a.title)} },`,
    )
    .join('\n')

  const contents = `/**
 * GENERATED -- do not edit by hand.
 * Regenerate: \`npm run generate:agent-roster\` (also runs automatically
 * before \`npm run dev\` / \`npm run build\`).
 * Source: GET ${ROSTER_URL}
 * (backend/avry-backend/app/routes/agent_roster.py)
 * Last generated: ${new Date().toISOString()}
 */

export const AGENT_ROSTER_RAW = [
${entries}
] as const
`

  writeFileSync(OUT_FILE, contents)
  console.log(`[generate-agent-roster] wrote ${agents.length} agents to lib/agentRoster.generated.ts`)
}

main()
