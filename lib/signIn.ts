/**
 * Where "sign in again" goes: the landing's /login with `?next=` set to the
 * page the user was on, so they come straight back after signing in. The
 * landing only follows same-site paths (`/dashboard/...`), which is where the
 * dashboard is served on prod (aivory.uk/dashboard).
 */
import { getMarketingUrl } from "@/lib/config"

export function signInUrl(marketing: string, here: { pathname: string; search: string } | null): string {
  const base = `${marketing.replace(/\/+$/, "")}/login`
  if (!here || !here.pathname.startsWith("/")) return base
  const next = here.pathname + here.search
  // Nothing to come back to on the sign-in page itself.
  if (next === "/" || next.startsWith("/login")) return base
  return `${base}?next=${encodeURIComponent(next)}`
}

/** `signInUrl` for the current page. */
export function signInUrlHere(): string {
  return signInUrl(getMarketingUrl(), typeof window === "undefined" ? null : window.location)
}
