/**
 * avry-crm pages its lists: `?limit=&cursor=`, next page in the `X-Next-Cursor`
 * response header (body stays a plain array). The dashboard works on the
 * whole set (pipeline totals, checklist, search), so lists follow the cursor
 * to the end, up to MAX_PAGES as a guard against a runaway loop.
 */
export const PAGE_LIMIT = 500
export const MAX_PAGES = 40 // 20,000 rows
export const NEXT_CURSOR_HEADER = "x-next-cursor"

export type PageResult<T> = { data: T[]; next: string | null }

export async function collectPages<T>(fetchPage: (cursor: string | null) => Promise<PageResult<T>>, maxPages = MAX_PAGES): Promise<T[]> {
  const rows: T[] = []
  let cursor: string | null = null
  for (let i = 0; i < maxPages; i++) {
    const { data, next } = await fetchPage(cursor)
    rows.push(...data)
    // An older avry-crm sends no header: one page, as before.
    if (!next || next === cursor) break
    cursor = next
  }
  return rows
}

/** `base` query plus this page's limit and cursor. */
export function pageQuery(base: URLSearchParams | undefined, cursor: string | null, limit = PAGE_LIMIT): string {
  const p = new URLSearchParams(base)
  p.set("limit", String(limit))
  if (cursor) p.set("cursor", cursor)
  return p.toString()
}
