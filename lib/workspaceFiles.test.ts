import { describe, it, expect } from "vitest"
import {
  validateUploadIntent,
  safeObjectName,
  objectKey,
  contentDisposition,
  MAX_FILE_BYTES,
} from "@/lib/workspaceFiles"

describe("validateUploadIntent", () => {
  it("accepts an allowed file", () => {
    const v = validateUploadIntent({ name: " SOP.pdf ", mime: "Application/PDF", size: 1024 })
    expect(v).toEqual({ ok: true, intent: { name: "SOP.pdf", mime: "application/pdf", size: 1024 } })
  })

  it.each([
    [{ mime: "application/pdf", size: 1 }, "name required"],
    [{ name: "x.exe", mime: "application/x-msdownload", size: 1 }, "file type not allowed"],
    [{ name: "x.svg", mime: "image/svg+xml", size: 1 }, "file type not allowed"],
    [{ name: "x.pdf", mime: "application/pdf", size: 0 }, "size required"],
    [{ name: "x.pdf", mime: "application/pdf", size: 1.5 }, "size required"],
    [{ name: "x.pdf", mime: "application/pdf", size: MAX_FILE_BYTES + 1 }, "file too large (max 25 MB)"],
    [null, "name required"],
  ])("rejects %j", (input, error) => {
    expect(validateUploadIntent(input)).toEqual({ ok: false, error })
  })

  it("accepts exactly the size cap", () => {
    expect(validateUploadIntent({ name: "a.pdf", mime: "application/pdf", size: MAX_FILE_BYTES }).ok).toBe(true)
  })
})

describe("safeObjectName", () => {
  it("strips path tricks and unsafe characters", () => {
    expect(safeObjectName("../../etc/passwd", "text/plain")).toBe("etc-passwd.txt")
    expect(safeObjectName("Laporan Q3 (final).pdf", "application/pdf")).toBe("Laporan-Q3-final-.pdf")
  })

  it("folds accents and falls back when nothing is left", () => {
    expect(safeObjectName("Café.md", "text/markdown")).toBe("Cafe.md")
    expect(safeObjectName("数据", "text/csv")).toBe("file.csv")
  })

  it("adds the mime extension only when missing", () => {
    expect(safeObjectName("notes", "text/plain")).toBe("notes.txt")
    expect(safeObjectName("sheet.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("sheet.xlsx")
  })
})

describe("objectKey", () => {
  it("builds a tenant-scoped key", () => {
    expect(objectKey({ workspaceId: "default", ownerId: "room-1", fileId: "f1", name: "a b.pdf", mime: "application/pdf" }))
      .toBe("ws/default/room/room-1/f1/a-b.pdf")
    expect(objectKey({ workspaceId: "t1", kind: "request", ownerId: "r1", fileId: "f1", name: "a.pdf", mime: "application/pdf" }))
      .toBe("ws/t1/request/r1/f1/a.pdf")
  })

  it("refuses segments that could escape the prefix", () => {
    expect(() => objectKey({ workspaceId: "default", ownerId: "../x", fileId: "f1", name: "a", mime: "text/plain" })).toThrow()
    expect(() => objectKey({ workspaceId: "a/b", ownerId: "r", fileId: "f1", name: "a", mime: "text/plain" })).toThrow()
  })
})

describe("contentDisposition", () => {
  it("quotes safely and keeps the UTF-8 name", () => {
    expect(contentDisposition('Café "x".pdf')).toBe(`attachment; filename="Caf_ _x_.pdf"; filename*=UTF-8''Caf%C3%A9%20%22x%22.pdf`)
  })
})
