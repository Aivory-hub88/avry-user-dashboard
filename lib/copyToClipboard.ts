/**
 * Copy text and report whether it actually landed on the clipboard.
 *
 * `navigator.clipboard.writeText` rejects in non-secure contexts, embedded /
 * pop-out browser panes and when permission is denied. Callers that reveal a
 * one-time secret must not claim success unless this resolves true.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // fall through to the legacy path
  }
  if (typeof document === 'undefined') return false
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  try {
    ta.select()
    return document.execCommand('copy') === true
  } catch {
    return false
  } finally {
    ta.remove()
  }
}
