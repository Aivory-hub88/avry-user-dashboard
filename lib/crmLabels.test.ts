import { describe, expect, it } from "vitest"
import { addLabel, getLabels, hasLabel, cleanPhone, isPlausiblePhone, labelCounts, MAX_LABELS, normalizeLabel, removeLabel, telHref, whatsappDigits, whatsappHref, withLabels, withSource } from "./crmLabels"

describe("labels", () => {
  it("normalizes: trims, drops a leading #, caps length", () => {
    expect(normalizeLabel("  #Hot   lead ")).toBe("Hot lead")
    expect(normalizeLabel("   ")).toBeNull()
    expect(normalizeLabel("x".repeat(60))).toHaveLength(24)
  })
  it("reads only clean string arrays, de-duplicated case-insensitively", () => {
    expect(getLabels({ labels: ["Hot", "hot", 3, " VIP "] })).toEqual(["Hot", "VIP"])
    expect(getLabels({ labels: "Hot" })).toEqual([])
    expect(getLabels(null)).toEqual([])
  })
  it("adds without duplicates and stops at the cap", () => {
    expect(addLabel(["Hot"], "hot")).toEqual(["Hot"])
    expect(addLabel(["Hot"], "VIP")).toEqual(["Hot", "VIP"])
    const full = Array.from({ length: MAX_LABELS }, (_, i) => `L${i}`)
    expect(addLabel(full, "extra")).toBe(full)
  })
  it("removes case-insensitively", () => {
    expect(removeLabel(["Hot", "VIP"], "hot")).toEqual(["VIP"])
  })
  it("keeps other custom fields and drops the key when empty", () => {
    expect(withLabels({ budget: "5jt" }, ["Hot"])).toEqual({ budget: "5jt", labels: ["Hot"] })
    expect(withLabels({ budget: "5jt", labels: ["Hot"] }, [])).toEqual({ budget: "5jt" })
    expect(withSource({ labels: ["A"] }, "Referral")).toEqual({ labels: ["A"], source: "Referral" })
    expect(withSource({ source: "X" }, "")).toEqual({})
  })
  it("counts labels across records, most used first", () => {
    const r = [{ custom_fields: { labels: ["Hot", "VIP"] } }, { custom_fields: { labels: ["hot"] } }, { custom_fields: {} }]
    expect(labelCounts(r)).toEqual([
      { label: "Hot", count: 2 },
      { label: "VIP", count: 1 },
    ])
    expect(hasLabel(r[0].custom_fields, "HOT")).toBe(true)
  })
})

describe("phone", () => {
  it("builds a WhatsApp link, reading a leading 0 as Indonesia", () => {
    expect(whatsappDigits("0812-3456-7890")).toBe("6281234567890")
    expect(whatsappDigits("+62 812 3456 7890")).toBe("6281234567890")
    expect(whatsappDigits("+1 (415) 555-0132")).toBe("14155550132")
    expect(whatsappDigits("0062812345678")).toBe("62812345678")
    expect(whatsappHref("0812345678")).toBe("https://wa.me/62812345678")
  })
  it("refuses things that are not phone numbers", () => {
    expect(whatsappHref("123")).toBeNull()
    expect(whatsappHref(null)).toBeNull()
    expect(telHref("12")).toBeNull()
    expect(isPlausiblePhone("call me")).toBe(false)
    expect(isPlausiblePhone("0812 3456 7890")).toBe(true)
    expect(isPlausiblePhone("+62 (21) 555-0100")).toBe(true)
  })
  it("keeps the + in tel links", () => {
    expect(telHref("+62 812-3456")).toBe("tel:+628123456")
    expect(telHref("0812 3456")).toBe("tel:08123456")
  })
})

describe("phone formats", () => {
  const good = ["+62 877-2858-9845", "0877-2858-9845", "62877 2858 9845", "(0877) 2858 9845", "0877.2858.9845", "+62.877.2858.9845", "08772858 9845"]
  it.each(good)("accepts %s and maps it to 628772858 9845", (n) => {
    expect(isPlausiblePhone(n)).toBe(true)
    expect(whatsappDigits(n)).toBe("6287728589845")
  })
  it("accepts pasted numbers with invisible marks, nbsp and Unicode dashes", () => {
    for (const n of ["\u202A+62 877-2858-9845\u202C", "\u200E+62\u00A0877\u20112858\u20139845", "+62 877\u20132858\u20149845\u200F"]) {
      expect(isPlausiblePhone(n)).toBe(true)
      expect(whatsappDigits(n)).toBe("6287728589845")
      expect(telHref(n)).toBe("tel:+6287728589845")
    }
    expect(cleanPhone("\u202A+62 877\u201128\u202C")).toBe("+62 877-28")
  })
  it("still rejects letters, too short and too long", () => {
    for (const n of ["abc", "0812 345 abc", "12345", "+62 877 2858 9845 1234 5", "0877-2858-9845 ext 2", "++62877", "62-"]) expect(isPlausiblePhone(n)).toBe(false)
  })
})
