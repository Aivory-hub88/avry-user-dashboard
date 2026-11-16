import { describe, expect, it } from "vitest"
import { isWhatsappNote, whatsappDirection, whatsappText } from "./crmWhatsapp"

describe("WhatsApp notes", () => {
  it("tells direction from the stored prefix and only for notes", () => {
    expect(whatsappDirection({ kind: "note", body: "WhatsApp received: Hello" })).toBe("in")
    expect(whatsappDirection({ kind: "note", body: "WhatsApp sent: Hi" })).toBe("out")
    expect(whatsappDirection({ kind: "note", body: "called their office" })).toBeNull()
    expect(whatsappDirection({ kind: "call", body: "WhatsApp sent: x" })).toBeNull()
    expect(isWhatsappNote({ kind: "note", body: null })).toBe(false)
  })
  it("strips the prefix and leaves other text alone", () => {
    expect(whatsappText("WhatsApp received: Hello\nthere")).toBe("Hello\nthere")
    expect(whatsappText("WhatsApp sent: Hi")).toBe("Hi")
    expect(whatsappText("plain note")).toBe("plain note")
  })
})
