"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import styles from "../diagnostics/placeholder.module.css"

export default function LogsPage() {
  const t = useTranslations("executionLogs")
  const tCommon = useTranslations("common")

  return (
    <div className={styles.placeholderContainer}>
      <div className={styles.content}>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.description}>{t("description")}</p>
        <div className={styles.actions}>
          <Link href="/dashboard" className={styles.primaryButton}>
            {tCommon("backToDashboard")}
          </Link>
          <Link href="/console" className={styles.secondaryButton}>
            {tCommon("openConsole")}
          </Link>
        </div>
      </div>
    </div>
  )
}
