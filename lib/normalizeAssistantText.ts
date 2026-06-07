/**
 * Normalize assistant text to remove boilerplate and ensure Aivory tone.
 * Conservative approach: only clean obvious repeated intros/outros.
 */

export function normalizeAssistantText(text: string): string {
  if (!text || typeof text !== 'string') return text

  let normalized = text

  // Remove repeated "Halo! 👋 Selamat datang di Aivory Console" if it appears multiple times
  const haloPattern = /Halo! 👋 Selamat datang di Aivory Console/g
  const haloMatches = normalized.match(haloPattern)
  if (haloMatches && haloMatches.length > 1) {
    // Keep only the first occurrence
    let firstFound = false
    normalized = normalized.replace(haloPattern, () => {
      if (!firstFound) {
        firstFound = true
        return 'Halo! 👋 Selamat datang di Aivory Console'
      }
      return ''
    })
  }

  // Remove overly formal closers if repeated (e.g., "Dengan senang hati..." appearing multiple times)
  const denganPattern = /Dengan senang hati[^.]*\./g
  const denganMatches = normalized.match(denganPattern)
  if (denganMatches && denganMatches.length > 1) {
    // Remove all but keep the content
    normalized = normalized.replace(denganPattern, '')
  }

  // Clean up excessive whitespace
  normalized = normalized.replace(/\n\n\n+/g, '\n\n')

  return normalized.trim()
}
