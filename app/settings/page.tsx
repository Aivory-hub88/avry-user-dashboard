"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useLocaleContext } from "@/hooks/useLocale"
import LanguageOptionCard from "@/components/shared/LanguageOptionCard"
import styles from "./settings.module.css"

import { useRouterContext } from '@/contexts/RouterContext'
import { ContinuedFromConsole } from '@/components/routing/ContinuedFromConsole'

export default function SettingsPage() {
  const t = useTranslations("settings")
  const tCommon = useTranslations("common")
  const { locale, setLocale } = useLocaleContext()

  const { pendingContext, clearPendingContext } = useRouterContext()
  const [routingNotice, setRoutingNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!pendingContext) return
    if (Date.now() - pendingContext.timestamp > 300000) { clearPendingContext(); return }
    if (pendingContext.targetRoute !== 'settings') return
    setRoutingNotice(pendingContext.aiReplySummary || pendingContext.triggerMessage)
    clearPendingContext()
  }, [pendingContext, clearPendingContext])

  return (
    <div className={styles.settingsContainer}>
      {routingNotice !== null && (
        <ContinuedFromConsole summary={routingNotice} onDismiss={() => setRoutingNotice(null)} />
      )}
      <h1 className={styles.pageTitle}>{t("title")}</h1>
      <p className={styles.pageDescription}>{t("description")}</p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("language")}</h2>
        <p className={styles.sectionDescription}>{t("languageDescription")}</p>
        <div className={styles.languageCards}>
          <LanguageOptionCard
            locale="en"
            label={t("english")}
            description={t("englishDescription")}
            isActive={locale === "en"}
            onClick={() => setLocale("en")}
          />
          <LanguageOptionCard
            locale="id"
            label={t("indonesian")}
            description={t("indonesianDescription")}
            isActive={locale === "id"}
            onClick={() => setLocale("id")}
          />
        </div>
      </section>

      <div className={styles.actions}>
        <Link href="/dashboard" className={styles.linkButton}>
          {tCommon("backToDashboard")}
        </Link>
        <Link href="/console" className={styles.linkButton}>
          {tCommon("openConsole")}
        </Link>
      </div>
    </div>
  )
}
