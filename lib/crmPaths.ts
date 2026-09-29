/**
 * Allowlist for the /api/crm proxy. Only these CRM routes are reachable, so a
 * crafted path can never address anything else on the CRM service.
 */
const ROOTS = new Set(["companies", "contacts", "deals", "activities", "grants"])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isAllowedCrmPath(segments: string[], method: string): boolean {
  const [root, id, sub] = segments
  if (!root || !ROOTS.has(root)) return false
  if (segments.length === 1) return method === "GET" || method === "POST"
  if (!UUID.test(id)) return false
  if (segments.length === 2) {
    if (root === "grants") return method === "DELETE"
    // Activities are append-only except for PATCH, which only toggles completion.
    return method === "GET" || method === "DELETE" || method === "PATCH"
  }
  return segments.length === 3 && root === "deals" && sub === "stage" && method === "PATCH"
}
