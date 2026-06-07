"use client"

import { useLocaleContext } from "@/hooks/useLocale"
import styles from "./LanguagePill.module.css"

export default function LanguagePill() {
  const { locale, setLocale } = useLocaleContext()

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
