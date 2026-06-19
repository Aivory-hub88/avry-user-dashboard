// Prefix local public-asset paths with the app basePath.
//
// Required because next.config.ts sets `basePath: "/dashboard"` together with
// `images: { unoptimized: true }`. With `unoptimized`, next/image does NOT
// auto-prepend the basePath to an image `src` (and raw <img> never does), so
// root-relative asset paths like "/integrations/slack.svg" 404 when the app is
// served under /dashboard. Wrap every local image src with asset().
//
// Keep BASE_PATH in sync with `basePath` in next.config.ts.
export const BASE_PATH = "/dashboard";

export function asset(path?: string | null): string {
  if (!path) return path ?? "";
  // Leave absolute URLs (http://, https://, //) and data/blob URIs untouched.
  if (/^([a-z]+:)?\/\//i.test(path) || /^(data|blob):/i.test(path)) return path;
  // Relative paths (no leading slash) are resolved by the browser — leave as-is.
  if (!path.startsWith("/")) return path;
  // Already prefixed — avoid double-prefixing.
  if (path === BASE_PATH || path.startsWith(BASE_PATH + "/")) return path;
  return BASE_PATH + path;
}
