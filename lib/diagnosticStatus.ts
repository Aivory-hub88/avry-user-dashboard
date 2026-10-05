import { loadDiagnosticContext } from '@/lib/reportStorage'

/**
 * Whether the signed-in account has a completed deep diagnostic.
 *
 * localStorage alone is not enough: it is per-browser, so a fresh browser or
 * cleared cache looked like "no diagnostic yet" while the account's Postgres
 * row held the result. loadDiagnosticContext() asks the server first and
 * refreshes the localStorage cache, so downstream readers see it too.
 */
export async function hasCompletedDiagnostic(): Promise<boolean> {
  try {
    return (await loadDiagnosticContext()) != null
  } catch {
    return typeof window !== 'undefined' && localStorage.getItem('aivory_diagnostic_context') !== null
  }
}
