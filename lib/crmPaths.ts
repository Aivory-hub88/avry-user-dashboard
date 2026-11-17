/**
 * Allowlist for the /api/crm proxy. Only these CRM routes are reachable, so a
 * crafted path can never address anything else on the CRM service.
 */
const ROOTS = new Set(["companies", "contacts", "deals", "activities", "grants"])
const ARCHIVABLE = new Set(["companies", "contacts", "deals"])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isAllowedCrmPath(segments: string[], method: string): boolean {
  const [root, id, sub] = segments
  if (!root || !ROOTS.has(root)) return false
  if (segments.length === 1) return method === "GET" || method === "POST"
  // Archived records (restore view) and the archive switch; grants have neither.
  if (id === "archived" && segments.length === 2) return root !== "grants" && root !== "activities" && method === "GET"
  if (segments.length === 3 && sub === "archive") return UUID.test(id ?? "") && ARCHIVABLE.has(root) && method === "PATCH"
  if (!UUID.test(id)) return false
  if (segments.length === 2) {
    if (root === "grants") return method === "DELETE"
    // Activities are append-only except for PATCH, which only toggles completion.
    return method === "GET" || method === "DELETE" || method === "PATCH"
  }
  return segments.length === 3 && root === "deals" && sub === "stage" && method === "PATCH"
}
