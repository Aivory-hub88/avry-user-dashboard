/**
 * AIVORY SERVICE CONFIGURATION
 * Single source of truth for all service URLs
 *
 * DO NOT hardcode URLs anywhere else in the codebase.
 * Always import from this file.
 *
 * To change a service URL, update ONLY this file.
 */

export const SERVICES = {
  /** Next.js App URL — client-side safe */
  APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',

  /** Next.js Console — server-side reference only */
  CONSOLE: process.env.NEXT_PUBLIC_CONSOLE_URL || 'http://localhost:3000',

  /** Payments Service — handles all Midtrans & wallet operations */
  PAYMENTS: process.env.NEXT_PUBLIC_PAYMENTS_URL || 'http://localhost:3030',

  /** VPS Bridge — primary AI gateway */
  VPS_BRIDGE: process.env.VPS_BRIDGE_URL || 'https://api.aivory.id',

  /** @deprecated VPS Bridge runs in internal-only mode (network isolation) and no longer validates API keys. Kept for legacy callers; always empty. */
  VPS_BRIDGE_API_KEY: '',

  /** Zeroclaw Gateway — accessed via VPS Bridge, not directly */
  ZEROCLAW: process.env.ZEROCLAW_URL || 'http://localhost:3010',

  /** n8n base URL — accessed via VPS Bridge tunnel */
  N8N: process.env.N8N_URL || 'https://n8n.aivory.id',

  /** n8n API key — server-side only */
  N8N_API_KEY: process.env.N8N_API_KEY || '',

  /** ARIA n8n webhook — routed via VPS Bridge */
  ARIA_WEBHOOK: process.env.ARIA_WEBHOOK_URL || 'https://api.aivory.id/webhook/755fcac8-dc36-49e3-9553-67e62bac82e8',

  /** OpenRouter API base URL */
  OPENROUTER: 'https://openrouter.ai/api/v1',
} as const

export const PORTS = {
  NEXTJS: 3000,
  PAYMENTS: 3030,
  VPS_BRIDGE: 3003,
  ZEROCLAW: 3010,
  N8N: 5678,
} as const
