import { describe, expect, it } from "vitest"
import { countParams, parseMetaTemplate, parseMetaTemplates, renderTemplate, templateMessageBody } from "./templates"

const tpl = (o: Record<string, unknown> = {}) => ({ name: "order_update", language: "id", category: "UTILITY", status: "APPROVED", components: [{ type: "BODY", text: "Halo {{1}}, pesanan {{2}} sudah dikirim." }], ...o })

describe("templates", () => {
  it("counts the highest positional variable", () => {
    expect(countParams("Halo {{1}}, kode {{ 2 }}")).toBe(2)
    expect(countParams("tanpa variabel")).toBe(0)
  })
  it("renders a preview and blanks missing variables", () => {
    expect(renderTemplate("Halo {{1}}, pesanan {{2}}", ["Irfan", "A12"])).toBe("Halo Irfan, pesanan A12")
    expect(renderTemplate("Halo {{1}}, {{2}}", ["Irfan"])).toBe("Halo Irfan, ")
  })
  it("keeps only approved templates", () => {
    expect(parseMetaTemplate(tpl({ status: "PENDING" }))).toBeNull()
    expect(parseMetaTemplate(tpl({ components: [] }))).toBeNull()
    expect(parseMetaTemplates({ data: [tpl(), tpl({ name: "x", status: "REJECTED" })] }).map((t) => t.name)).toEqual(["order_update"])
    expect(parseMetaTemplate(tpl())).toMatchObject({ name: "order_update", language: "id", category: "utility", params: 2, usable: true })
  })
  it("marks templates we cannot fill from a text box as unusable", () => {
    const withHeader = (format: string, text = "") => tpl({ components: [{ type: "HEADER", format, text }, { type: "BODY", text: "Hai" }] })
    expect(parseMetaTemplate(withHeader("IMAGE"))?.usable).toBe(false)
    expect(parseMetaTemplate(withHeader("TEXT", "Promo {{1}}"))?.usable).toBe(false)
    expect(parseMetaTemplate(withHeader("TEXT", "Promo"))?.usable).toBe(true)
    expect(parseMetaTemplate(tpl({ components: [{ type: "BODY", text: "Hai" }, { type: "BUTTONS", buttons: [{ type: "URL", url: "https://x.test/{{1}}" }] }] }))?.usable).toBe(false)
    expect(parseMetaTemplate(tpl({ components: [{ type: "BODY", text: "Hai" }, { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Ya" }, { type: "URL", url: "https://x.test" }] }] }))?.usable).toBe(true)
    expect(parseMetaTemplate(tpl({ parameter_format: "NAMED" }))?.usable).toBe(false)
  })
  it("builds the Cloud API send body", () => {
    expect(templateMessageBody("6281", "order_update", "id", ["Irfan", "A12"])).toEqual({
      messaging_product: "whatsapp",
      to: "6281",
      type: "template",
      template: { name: "order_update", language: { code: "id" }, components: [{ type: "body", parameters: [{ type: "text", text: "Irfan" }, { type: "text", text: "A12" }] }] },
    })
    expect(templateMessageBody("6281", "hello", "en", []).template.components).toEqual([])
  })
})
