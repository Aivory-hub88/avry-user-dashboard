"use client"

import { useLocaleContext } from "@/hooks/useLocale"
import styles from "./LanguagePill.module.css"

export default function LanguagePill({ collapsed = false }: { collapsed?: boolean }) {
  const { locale, setLocale } = useLocaleContext()

  // Collapsed sidebar is only 48px wide — the two-segment pill would clip,
  // so collapse to a single toggle showing the current locale instead.
  if (collapsed) {
    const next = locale === "en" ? "id" : "en"
    return (
      <button
        className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-[10px] font-semibold tracking-wider text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
        onClick={() => setLocale(next)}
        title={locale === "en" ? "Switch to Bahasa Indonesia" : "Switch to English"}
        aria-label={locale === "en" ? "Switch to Bahasa Indonesia" : "Switch to English"}
      >
        {locale === "en" ? "EN" : "ID"}
      </button>
    )
  }

  return (
    <div className={styles.pill} role="radiogroup" aria-label="Language">
      <button
        className={`${styles.segment} ${locale === "en" ? styles.active : ""}`}
        onClick={() => setLocale("en")}
        role="radio"
        aria-checked={locale === "en"}
        aria-label="English"
      >
        ENG
      </button>
      <button
        className={`${styles.segment} ${locale === "id" ? styles.active : ""}`}
        onClick={() => setLocale("id")}
        role="radio"
        aria-checked={locale === "id"}
        aria-label="Bahasa Indonesia"
      >
        IDN
      </button>
    </div>
  )
}
