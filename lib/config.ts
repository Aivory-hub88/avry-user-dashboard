/**
 * Configuration module for VPS Bridge integration
 *
 * Delegates to config/services.ts — the single source of truth for all URLs.
 * Do not add new hardcoded URLs here; add them to config/services.ts instead.
 */

import { SERVICES } from '@/config/services'

export interface Config {
  VPS_BRIDGE_URL: string
  /** @deprecated VPS Bridge no longer validates API keys. Kept for legacy callers; always empty string. */
  VPS_BRIDGE_API_KEY: string
}

/**
 * VPS Bridge configuration for server-side API routes.
 * Used by routes that import VPS_BRIDGE_CONFIG directly.
 *
 * NOTE: VPS Bridge runs in internal-only mode (network isolation).
 * `apiKey` is kept for backward compatibility and is no longer sent or validated.
 */
export const VPS_BRIDGE_CONFIG = {
  baseUrl: SERVICES.VPS_BRIDGE,
  /** @deprecated no longer used; VPS Bridge is internal-only */
  apiKey: '',
}

/**
 * Returns the VPS bridge configuration.
 * Only VPS_BRIDGE_URL is required; API key is no longer validated.
 */
export function getConfig(): Config {
  const VPS_BRIDGE_URL = process.env.VPS_BRIDGE_URL || process.env.NEXT_PUBLIC_VPS_BRIDGE_URL

  if (!VPS_BRIDGE_URL) {
    throw new Error(
      `Missing required environment variable: VPS_BRIDGE_URL. ` +
      `Please ensure it is set in your .env.local file.`
    )
  }

  return {
    VPS_BRIDGE_URL,
    VPS_BRIDGE_API_KEY: '',
  }
}

/**
 * Validates configuration without throwing.
 * Useful for health checks and startup validation.
 */
export function validateConfig(): { valid: boolean; missingVars: string[] } {
  const missingVars: string[] = []

  if (!process.env.VPS_BRIDGE_URL && !process.env.NEXT_PUBLIC_VPS_BRIDGE_URL) {
    missingVars.push('VPS_BRIDGE_URL')
  }

  return { valid: missingVars.length === 0, missingVars }
}

/* -------------------------------------------------------------------------- */
/* Deterministic app URL resolution (Requirements 4.1–4.5)                    */
/* -------------------------------------------------------------------------- */

/**
 * Canonical base URLs. These defaults mirror the marketing app exactly so the
 * two apps resolve hand-off targets identically.
 *
 * Local-dev ports/hosts come from the legacy source of truth:
 *   - dashboard (nextjs-console) → http://localhost:3000
 *   - marketing (frontend-nextjs) → http://localhost:9000
 */
export const DASHBOARD_URL_PROD = 'https://dashboard.aivory.id'
export const DASHBOARD_URL_LOCAL = 'http://localhost:3000'
export const MARKETING_URL_PROD = 'https://aivory.id'
export const MARKETING_URL_LOCAL = 'http://localhost:9000'

/**
 * Injectable inputs for the URL resolvers. Every field is optional; when a
 * field is omitted the resolver falls back to the ambient environment
 * (`process.env` and, in the browser, `window.location.host`). Passing an
 * explicit input keeps the resolvers pure and fully testable.
 */
export interface UrlResolverInput {
  /** Raw value of `NEXT_PUBLIC_DASHBOARD_URL` (pre-trim). */
  dashboardEnv?: string | null
  /** Raw value of `NEXT_PUBLIC_MARKETING_URL` (pre-trim). */
  marketingEnv?: string | null
  /** Request/browser host, e.g. `localhost:3000` or `dashboard.aivory.id`. */
  host?: string | null
}

/**
 * SSR-safe host read. Returns `undefined` on the server so resolution falls
 * back to the production defaults without ever touching `window`.
 */
function ambientHost(): string | undefined {
  if (typeof window === 'undefined') return undefined
  return window.location?.host
}

/**
 * Returns true when `host` is the local loopback (`localhost` / `127.0.0.1`),
 * compared case-insensitively and ignoring any `:port` suffix (Req 4.2).
 */
function isLocalHost(host: string | null | undefined): boolean {
  if (!host) return false
  const hostname = host.split(':')[0].trim().toLowerCase()
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

/**
 * Resolves the Product Dashboard base URL deterministically (Req 4.1–4.4).
 *
 * Precedence:
 *   1. Trimmed `NEXT_PUBLIC_DASHBOARD_URL` when non-empty after trimming.
 *   2. `http://localhost:3000` when the host is `localhost` / `127.0.0.1`.
 *   3. `https://dashboard.aivory.id` otherwise.
 *
 * The result is byte-for-byte identical for identical inputs (Req 4.4).
 */
export function getDashboardUrl(input: UrlResolverInput = {}): string {
  const rawEnv = input.dashboardEnv ?? process.env.NEXT_PUBLIC_DASHBOARD_URL ?? ''
  const env = rawEnv.trim()
  if (env) return env

  const host = input.host ?? ambientHost()
  return isLocalHost(host) ? DASHBOARD_URL_LOCAL : DASHBOARD_URL_PROD
}

/**
 * Resolves the Marketing Site base URL deterministically, using the same
 * precedence shape as {@link getDashboardUrl} but with `NEXT_PUBLIC_MARKETING_URL`
 * and the marketing defaults.
 *
 * GUARANTEE (Req 4.5): the marketing URL is never byte-equal to the dashboard
 * URL for the same inputs. If a misconfiguration would make them collide, the
 * marketing URL is deterministically disambiguated so the two apps can never
 * cross-point.
 */
export function getMarketingUrl(input: UrlResolverInput = {}): string {
  const rawEnv = input.marketingEnv ?? process.env.NEXT_PUBLIC_MARKETING_URL ?? ''
  const env = rawEnv.trim()

  let url: string
  if (env) {
    url = env
  } else {
    const host = input.host ?? ambientHost()
    url = isLocalHost(host) ? MARKETING_URL_LOCAL : MARKETING_URL_PROD
  }

  // Never byte-equal to the dashboard URL (Req 4.5). The dashboard URL is the
  // primary; marketing yields with a deterministic, collision-free suffix.
  const dashboard = getDashboardUrl(input)
  if (url === dashboard) {
    url = url.endsWith('/') ? `${url}marketing` : `${url}/marketing`
  }
  return url
}
