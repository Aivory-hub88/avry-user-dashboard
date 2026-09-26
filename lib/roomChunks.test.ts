import { describe, it, expect } from "vitest"
import { chunkText, rankChunks, terms, MAX_CHUNKS_PER_FILE } from "@/lib/roomChunks"

describe("chunkText", () => {
  it("keeps short text whole", () => {
    expect(chunkText("  Hello world.  ")).toEqual(["Hello world."])
    expect(chunkText("   ")).toEqual([])
  })

  it("splits long text on paragraph boundaries with overlap", () => {
    const para = (n: number) => `Paragraph ${n}. ` + "word ".repeat(60).trim()
    const text = Array.from({ length: 10 }, (_, i) => para(i)).join("\n\n")
    const chunks = chunkText(text, 800, 100)
    expect(chunks.length).toBeGreaterThan(2)
    expect(chunks.every((c) => c.length <= 800)).toBe(true)
    expect(chunks.join(" ")).toContain("Paragraph 9.")
    // overlap: the start of chunk 2 appears at the end of chunk 1
    expect(chunks[0].endsWith(chunks[1].slice(0, 20))).toBe(false)
    expect(chunks[0].includes(chunks[1].slice(0, 12))).toBe(true)
  })

  it("caps chunks per file", () => {
    expect(chunkText("x".repeat(1200 * (MAX_CHUNKS_PER_FILE + 20)), 1200, 0).length).toBe(MAX_CHUNKS_PER_FILE)
  })
})

describe("terms", () => {
  it("drops English and Indonesian stopwords, folds accents", () => {
    expect(terms("What is the Café migration plan? Apa rencana migrasi yang dipakai?")).toEqual([
      "cafe", "migration", "plan", "rencana", "migrasi", "dipakai",
    ])
  })
})

describe("rankChunks", () => {
  const items = [
    { id: "a", text: "Customer export has 1,248 rows from the old CRM." },
    { id: "b", text: "Odoo migration timeline: import customers before 30 November, then quotes." },
    { id: "c", text: "Office party is on Friday." },
  ]

  it("puts the chunk that answers the question first", () => {
    const r = rankChunks("when is the Odoo migration deadline for customers?", items)
    expect(r[0].item.id).toBe("b")
    expect(r.map((x) => x.item.id)).not.toContain("c")
  })

  it("returns nothing when no term matches", () => {
    expect(rankChunks("zebra giraffe", items)).toEqual([])
    expect(rankChunks("the and of", items)).toEqual([])
  })
})
