"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { DashboardData, getPlaceholderData } from "@/types/dashboard"
import { DeepDiagnosticService } from "@/services/deepDiagnostic"
import OverviewCard from "@/components/dashboard/OverviewCard"
import LifecycleCard from "@/components/dashboard/LifecycleCard"
import RecentActivity from "@/components/dashboard/RecentActivity"
import LoadingState from "@/components/dashboard/LoadingState"
import ErrorState from "@/components/dashboard/ErrorState"
import styles from "./overview.module.css"
import { useRouterContext } from '@/contexts/RouterContext'
import { ContinuedFromConsole } from '@/components/routing/ContinuedFromConsole'

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [deepDiagnosticCompleted, setDeepDiagnosticCompleted] = useState(false)
  const t = useTranslations("dashboard")

  const { pendingContext, clearPendingContext } = useRouterContext()
  const [routingNotice, setRoutingNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!pendingContext) return
    if (Date.now() - pendingContext.timestamp > 300000) { clearPendingContext(); return }
    if (pendingContext.targetRoute !== 'dashboard') return
    setRoutingNotice(pendingContext.aiReplySummary || pendingContext.triggerMessage)
    clearPendingContext()
  }, [pendingContext, clearPendingContext])

  useEffect(() => {
    fetchDashboardData()

    // Check deep diagnostic status — presence of aivory_diagnostic_context means complete
    const deepContext = localStorage.getItem('aivory_diagnostic_context')
    if (deepContext) {
      setDeepDiagnosticCompleted(true)
    }
  }, [])

  const fetchDashboardData = async () => {
    setData(getPlaceholderData())
    setLoading(false)
  }

  if (loading) {
    return <LoadingState />
  }

  if (!data) {
    return <ErrorState onRetry={fetchDashboardData} />
  }

  // Diagnostics card state — deep diagnostic only (free diagnostic moved to landing page)
  const diagnosticsStatus = deepDiagnosticCompleted ? 'completed' : data.diagnostic.status
  const diagnosticsHref = deepDiagnosticCompleted
    ? '/diagnostics/deep/final-result'
    : '/diagnostics/deep'
  const diagnosticsCta = deepDiagnosticCompleted
    ? 'View AI Report'
    : data.diagnostic.status === 'not_started'
    ? t('diagnosticsCard.startDiagnostic')
    : t('diagnosticsCard.continueDiagnostic')
  const diagnosticsDescription = deepDiagnosticCompleted
    ? 'Deep diagnostic complete — your AI readiness report is ready.'
    : t('diagnosticsCard.descriptionNotStarted')

  return (
    <div className={styles.dashboardContainer}>
      {routingNotice !== null && (
        <ContinuedFromConsole summary={routingNotice} onDismiss={() => setRoutingNotice(null)} />
      )}

      {/* Full-width page title spanning both columns */}
      <h1 className={styles.pageTitle}>{t('title')}</h1>

      {/* Left column: overview card (tall anchor) */}
      <div className={styles.mainContent}>
        <OverviewCard
          data={data}
          deepDiagnosticCompleted={deepDiagnosticCompleted}
        />
      </div>

      {/* Right column: 2x2 grid of lifecycle cards + recent activity */}
      <div className={styles.rightColumn}>
        <LifecycleCard
          title={t('diagnosticsCard.title')}
          description={diagnosticsDescription}
          status={diagnosticsStatus}
          cta={diagnosticsCta}
          href={diagnosticsHref}
        />
        <LifecycleCard
          title={t('blueprintCard.title')}
          description={t('blueprintCard.description')}
          status={data.blueprint.status}
          cta={data.blueprint.status === 'none' ? t('blueprintCard.generateBlueprint') : t('blueprintCard.viewBlueprint')}
          href="/blueprint"
        />
        <LifecycleCard
          title={t('workflowsCard.title')}
          description={t('workflowsCard.description')}
          status={data.workflows.active > 0 ? 'active' : 'none'}
          cta={t('workflowsCard.viewWorkflows')}
          href="/workflows"
        />
        <RecentActivity events={data.recentActivity} />
      </div>
    </div>
  )
}
