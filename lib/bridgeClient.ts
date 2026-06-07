/**
 * VPS Bridge API Client
 *
 * Central helper for all server-side calls to the VPS Bridge.
 * All Next.js API routes that talk to the VPS Bridge should use this.
 *
 * Usage:
 *   import { postToBridge } from '@/lib/bridgeClient'
 *   const res = await postToBridge('/bridge/aira', { message: '...' })
 *
 * The base URL is read from environment variables:
 *   VPS_BRIDGE_URL        — server-side (API routes)
 *
 * Auth: VPS Bridge runs internal-only (network isolation), no API key required.
 */

const BASE_URL = (
  process.env.VPS_BRIDGE_URL ||
  process.env.NEXT_PUBLIC_VPS_BRIDGE_URL ||
  'http://43.156.108.96:3003'
).replace(/\/$/, '');

if (!BASE_URL) {
  throw new Error('VPS_BRIDGE_URL is not defined. Set it in .env.local');
}

/**
 * POST to a VPS Bridge endpoint.
 * Automatically injects Content-Type header.
 *
 * @param path   - Endpoint path, e.g. '/bridge/aira'
 * @param body   - JSON-serializable request body
 * @param options - Additional fetch options (headers, signal, etc.)
 */
export async function postToBridge(
  path: string,
  body: Record<string, unknown>,
  options: RequestInit = {}
): Promise<Response> {
  const { headers: extraHeaders, ...restOptions } = options;

  return fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(extraHeaders as Record<string, string>),
    },
    body: JSON.stringify(body),
    ...restOptions,
  });
}

/**
 * POST to a VPS Bridge endpoint and parse the JSON response.
 * Throws on non-2xx status.
 */
export async function postToBridgeJson<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  options: RequestInit = {}
): Promise<T> {
  const res = await postToBridge(path, body, options);

  if (!res.ok) {
    let msg = `Bridge ${path} failed (${res.status})`;
    try {
      const err = await res.json();
      msg = err.message || err.detail || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  return res.json() as Promise<T>;
}

export { BASE_URL as VPS_BRIDGE_BASE_URL };
