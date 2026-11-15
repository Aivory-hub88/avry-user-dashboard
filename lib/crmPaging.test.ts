import { describe, expect, it } from "vitest"
import { collectPages, pageQuery, type PageResult } from "./crmPaging"

const pager = (pages: number[][]) => {
  const seen: (string | null)[] = []
  const fetchPage = async (cursor: string | null): Promise<PageResult<number>> => {
    seen.push(cursor)
    const i = cursor === null ? 0 : Number(cursor)
    return { data: pages[i], next: i + 1 < pages.length ? String(i + 1) : null }
  }
  return { fetchPage, seen }
}

describe("collectPages", () => {
  it("follows the cursor to the last page", async () => {
    const { fetchPage, seen } = pager([[1, 2], [3, 4], [5]])
    expect(await collectPages(fetchPage)).toEqual([1, 2, 3, 4, 5])
    expect(seen).toEqual([null, "1", "2"])
  })
  it("reads one page from a server that sends no cursor", async () => {
    expect(await collectPages(async () => ({ data: [1, 2, 3], next: null }))).toEqual([1, 2, 3])
  })
  it("stops at maxPages and on a repeated cursor", async () => {
    let calls = 0
    expect(await collectPages(async () => ({ data: [calls++], next: `c${calls}` }), 3)).toEqual([0, 1, 2])
    let n = 0
    expect(await collectPages(async () => ({ data: [n++], next: "same" }))).toEqual([0, 1])
  })
})

describe("pageQuery", () => {
  it("keeps filters and adds limit and cursor", () => {
    expect(pageQuery(new URLSearchParams({ has_due: "true" }), "abc")).toBe("has_due=true&limit=500&cursor=abc")
    expect(pageQuery(undefined, null, 50)).toBe("limit=50")
  })
})
