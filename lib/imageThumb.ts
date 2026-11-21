/**
 * Small JPEG thumbnail of an image file, for attachment tiles.
 *
 * The full image (a data URL of megabytes) is only needed for the one send; the
 * thumbnail is ~10-30 KB, so it can stay on the attachment and survive persistence
 * (see chatPersistence.stripHeavyAttachments) and reloads.
 */

export const THUMB_MAX_EDGE = 320

/** Largest size that fits `max` on its longer edge, never upscaling. */
export function thumbSize(w: number, h: number, max = THUMB_MAX_EDGE): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: 0, h: 0 }
  const scale = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) }
}

/** Returns a data:image/jpeg URL, or undefined when the browser can't decode/draw it. */
export async function makeImageThumb(file: Blob, max = THUMB_MAX_EDGE): Promise<string | undefined> {
  if (typeof document === 'undefined' || !file.type.startsWith('image/')) return undefined
  try {
    const bitmap = await createImageBitmap(file)
    const { w, h } = thumbSize(bitmap.width, bitmap.height, max)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    // JPEG has no alpha: paint white so transparent PNGs don't turn black.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    return canvas.toDataURL('image/jpeg', 0.8)
  } catch {
    return undefined
  }
}
