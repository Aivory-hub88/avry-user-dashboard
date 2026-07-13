'use client'
import { asset } from "@/lib/asset";

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import styles from './integrations.module.css'
import type { AivoryApp, AivoryConnection, CreateConnectionPayload } from '@/types/integrations'
import { useRouterContext } from '@/contexts/RouterContext'
import { ContinuedFromConsole } from '@/components/routing/ContinuedFromConsole'

// ── Helpers ──────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── ProviderButton (Composio OAuth) ─────────────────────

interface ProviderButtonProps {
  app: AivoryApp & { providerEnabled?: boolean }
  onPopupOpened?: (appId: string) => void
}

function ProviderButton({ app, onPopupOpened }: ProviderButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    try {
      // 1. Get the Composio session — surfaces auth/gating errors server-side
      const sessionRes = await fetch('/api/integrations/oauth?action=session')
      if (!sessionRes.ok) throw new Error('Failed to create session')

      // 2. Initiate Composio OAuth — opens the provider's auth page.
      // The entity is derived from the session server-side; never send a client userId.
      const connectRes = await fetch('/api/integrations/oauth/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: app.id }),
      })
      if (!connectRes.ok) throw new Error('Failed to initiate connection')
      const { redirectUrl } = await connectRes.json()

      if (redirectUrl) {
        // Open OAuth in a popup window
        const popup = window.open(redirectUrl, 'composio-oauth', 'width=600,height=700')
        if (popup) {
          onPopupOpened?.(app.id)
        }
      }
    } catch (err) {
      console.error('[ProviderButton] OAuth error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      className={styles.providerBtn}
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? 'Connecting...' : (app.connectLabel ?? `Connect ${app.name}`)}
    </button>
  )
}

// ── Connect / Reconnect Modal ────────────────────────────

interface ConnectModalProps {
  app: AivoryApp
  existingId?: string   // set when reconnecting
  onClose: () => void
  onSaved: () => void
}

function ConnectModal({ app, existingId, onClose, onSaved }: ConnectModalProps) {
  const t = useTranslations("integrations")
  const tCommon = useTranslations("common")
  const [displayName, setDisplayName] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isReconnect = !!existingId

  const handleSubmit = async () => {
    if (!isReconnect && !displayName.trim()) {
      setError(t('connectionNameRequired'))
      return
    }
    for (const f of app.fields) {
      if (f.required && !fieldValues[f.key]?.trim()) {
        setError(`${f.label} is required`)
        return
      }
    }

    setSaving(true)
    setError('')

    try {
      let res: Response
      if (isReconnect) {
        res = await fetch(`/api/integrations/connections/${existingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credentials: fieldValues }),
        })
      } else {
        const payload: CreateConnectionPayload = {
          appId: app.id,
          displayName: displayName.trim(),
          credentials: fieldValues,
        }
        res = await fetch('/api/integrations/connections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Failed (${res.status})`)
      }

      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          {app.iconPath ? (
            <span className={styles.modalAppIcon} data-brand={app.id.toLowerCase()}>
              <img src={asset(app.iconPath)} alt="" style={{ width: 28, height: 28 }} />
            </span>
          ) : (
            <span className={styles.modalAppIcon}>{app.icon}</span>
          )}
          <div>
            <p className={styles.modalTitle}>{isReconnect ? `Reconnect ${app.name}` : `Connect ${app.name}`}</p>
            <p className={styles.modalSubtitle}>{app.description}</p>
          </div>
        </div>

        <p className={styles.securityNote}>
          {t("securityNote")}
        </p>

        {!isReconnect && (
          <div className={styles.formField}>
            <label className={styles.formLabel}>{t("connectionName")}</label>
            <input
              className={styles.formInput}
              placeholder={`e.g. ${app.name} Production`}
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {app.fields.map(f => (
          <div key={f.key} className={styles.formField}>
            <label className={styles.formLabel}>
              {f.label}{!f.required && <span className={styles.optionalTag}> optional</span>}
            </label>
            <input
              className={styles.formInput}
              type={f.type === 'password' ? 'password' : f.type === 'url' ? 'url' : 'text'}
              placeholder={f.placeholder}
              value={fieldValues[f.key] ?? ''}
              onChange={e => setFieldValues(prev => ({ ...prev, [f.key]: e.target.value }))}
            />
          </div>
        ))}

        {error && <p className={styles.errorMsg}>{error}</p>}

        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onClose}>{tCommon("cancel")}</button>
          <button className={styles.saveBtn} onClick={handleSubmit} disabled={saving}>
            {saving ? t("saving") : isReconnect ? t("updateCredentials") : t("saveConnection")}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Status badge ─────────────────────────────────────────

function StatusBadge({ status }: { status: AivoryConnection['status'] }) {
  const map = {
    connected: { label: 'Connected', cls: styles.statusConnected },
    revoked: { label: 'Revoked', cls: styles.statusRevoked },
    needs_reauth: { label: 'Needs re-auth', cls: styles.statusReauth },
  }
  const { label, cls } = map[status]
  return <span className={`${styles.statusBadge} ${cls}`}>{label}</span>
}


// ── Main Page ────────────────────────────────────────────

type AppWithEnabled = AivoryApp & { providerEnabled?: boolean }

function IntegrationsContent() {
  const searchParams = useSearchParams()
  const [apps, setApps] = useState<AppWithEnabled[]>([])
  const [connections, setConnections] = useState<AivoryConnection[]>([])
  const [connectingApp, setConnectingApp] = useState<AivoryApp | null>(null)
  const [reconnectTarget, setReconnectTarget] = useState<{ app: AivoryApp; connId: string } | null>(null)
  const [loadingApps, setLoadingApps] = useState(true)
  const [loadingConns, setLoadingConns] = useState(true)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const t = useTranslations("integrations")
  const tCommon = useTranslations("common")

  const { pendingContext, clearPendingContext } = useRouterContext()
  const [routingNotice, setRoutingNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!pendingContext) return
    if (Date.now() - pendingContext.timestamp > 300000) { clearPendingContext(); return }
    if (pendingContext.targetRoute !== 'integrations') return
    setRoutingNotice(pendingContext.aiReplySummary || pendingContext.triggerMessage)
    clearPendingContext()
  }, [pendingContext, clearPendingContext])

  // Handle ?connected= and ?error= query params from Express OAuth redirect
  useEffect(() => {
    if (!searchParams) return
    const connected = searchParams.get('connected')
    const error = searchParams.get('error')
    const provider = searchParams.get('provider')

    if (connected) {
      setFeedback({ type: 'success', message: `Successfully connected ${connected}` })
      // Auto-dismiss after 5s
      const timer = setTimeout(() => setFeedback(null), 5000)
      return () => clearTimeout(timer)
    }
    if (error) {
      const errorMessages: Record<string, string> = {
        invalid_state: 'OAuth session expired or invalid. Please try again.',
        access_denied: `Access was denied${provider ? ` by ${provider}` : ''}. Please try again.`,
        token_exchange_failed: `Token exchange failed${provider ? ` for ${provider}` : ''}. Please try again.`,
      }
      setFeedback({ type: 'error', message: errorMessages[error] || `OAuth error: ${error}` })
      const timer = setTimeout(() => setFeedback(null), 8000)
      return () => clearTimeout(timer)
    }
  }, [searchParams])

  const fetchApps = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/apps')
      if (res.ok) setApps(await res.json())
    } finally {
      setLoadingApps(false)
    }
  }, [])

  const fetchConnections = useCallback(async () => {
    try {
      // Fetch OAuth connections from Next.js API (Composio)
      const oauthRes = await fetch(`/api/integrations/oauth?action=status`)
      const oauthConns = oauthRes.ok ? await oauthRes.json() : []

      // Fetch manual (API key/basic) connections from Next.js API
      const manualRes = await fetch('/api/integrations/connections')
      const manualConns = manualRes.ok ? await manualRes.json() : []

      // Merge: manual connections + OAuth connections
      const manualOnly = manualConns.filter((c: AivoryConnection) => c.authType !== 'oauth')
      setConnections([...manualOnly, ...oauthConns])
    } finally {
      setLoadingConns(false)
    }
  }, [])

  useEffect(() => {
    fetchApps()
    fetchConnections()
  }, [fetchApps, fetchConnections])

  // ── OAuth Connection Polling ───────────────────────────
  // After opening a Composio OAuth popup, poll /auth/status every 2s
  // until connection appears or 120s timeout
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startConnectionPolling = useCallback((targetAppId: string) => {
    // Stop any existing poll
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)

    const startTime = Date.now()
    const POLL_INTERVAL = 2000
    const POLL_TIMEOUT = 120000

    pollTimerRef.current = setInterval(async () => {
      if (Date.now() - startTime > POLL_TIMEOUT) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
        return
      }

      try {
        const res = await fetch(`/api/integrations/oauth?action=status`)
        if (res.ok) {
          const conns: AivoryConnection[] = await res.json()
          const found = conns.find(c => c.appId === targetAppId && c.status === 'connected')
          if (found) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current)
            pollTimerRef.current = null
            setFeedback({ type: 'success', message: `Successfully connected ${found.appName}` })
            fetchConnections()
          }
        }
      } catch { /* ignore poll errors */ }
    }, POLL_INTERVAL)
  }, [fetchConnections])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [])

  // Revoke: OAuth connections use Express backend, manual use Next.js API
  const handleRevoke = async (conn: AivoryConnection) => {
    if (!confirm(`Revoke "${conn.displayName}"? Workflows using this connection will stop working.`)) return

    try {
      if (conn.authType === 'oauth' && conn.oauthProvider) {
        const res = await fetch('/api/integrations/oauth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'revoke', connectedAccountId: conn.id }),
        })
        if (!res.ok) throw new Error('Failed to revoke OAuth connection')
      } else {
        const res = await fetch(`/api/integrations/connections/${conn.id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed to delete connection')
      }
      setFeedback({ type: 'success', message: `Successfully revoked ${conn.displayName}` })
    } catch (err) {
      console.error('[Revoke] Error:', err)
      setFeedback({ type: 'error', message: 'Failed to revoke connection' })
    } finally {
      fetchConnections()
    }
  }

  // Reconnect: OAuth uses Composio flow, manual uses credential modal
  const handleReconnect = async (conn: AivoryConnection) => {
    const app = apps.find(a => a.id === conn.appId) as AppWithEnabled | undefined
    if (!app) return

    if (conn.authType === 'oauth' && app.oauthProvider) {
      try {
        const sessionRes = await fetch('/api/integrations/oauth?action=session')
        if (!sessionRes.ok) throw new Error('Failed to create session')

        // The entity is derived from the session server-side; never send a client userId.
        const connectRes = await fetch('/api/integrations/oauth/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appId: app.id }),
        })
        if (!connectRes.ok) throw new Error('Failed to initiate reconnection')
        const { redirectUrl } = await connectRes.json()

        if (redirectUrl) {
          window.open(redirectUrl, 'composio-oauth', 'width=600,height=700')
          setFeedback({ type: 'success', message: `Reconnecting ${app.name}...` })
          startConnectionPolling(app.id)
        }
      } catch (err) {
        console.error('[Reconnect] Error:', err)
      }
    } else {
      setReconnectTarget({ app, connId: conn.id })
    }
  }

  const connectedAppIds = new Set(
    connections.filter(c => c.status === 'connected').map(c => c.appId)
  )

  return (
    <div className={`${styles.page} font-manrope`}>
      {routingNotice !== null && (
        <ContinuedFromConsole summary={routingNotice} onDismiss={() => setRoutingNotice(null)} />
      )}
      {feedback && (
        <div style={{
          padding: '10px 16px',
          marginBottom: 16,
          borderRadius: 8,
          fontSize: '0.875rem',
          background: feedback.type === 'success' ? 'rgba(45,212,191,0.1)' : 'rgba(248,113,113,0.1)',
          border: `1px solid ${feedback.type === 'success' ? 'rgba(45,212,191,0.3)' : 'rgba(248,113,113,0.3)'}`,
          color: feedback.type === 'success' ? '#2dd4bf' : '#f87171',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1rem', padding: '0 4px' }}
          >
            ×
          </button>
        </div>
      )}
      <div className={styles.header}>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.subtitle}>{t("description")}</p>
      </div>

      {/* ── Your Connections ── */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>{t("connected")}</p>
        {loadingConns ? (
          <p className={styles.emptyMsg}>{tCommon("loading")}...</p>
        ) : connections.length === 0 ? (
          <p className={styles.emptyMsg}>{t("noIntegrations")}</p>
        ) : (
          <div className={styles.table}>
            <div className={styles.tableHeader}>
              <span>{t("app")}</span>
              <span>{t("name")}</span>
              <span>{t("status")}</span>
              <span>{t("lastUsed")}</span>
              <span>{t("actions")}</span>
            </div>
            {connections.map(conn => {
              const app = apps.find(a => a.id === conn.appId)
              return (
                <div key={conn.id} className={styles.tableRow}>
                  <span className={styles.tableAppCell}>
                    {app?.iconPath ? (
                      <span className={styles.tableAppIcon} data-brand={app?.id.toLowerCase()}>
                        <img src={asset(app.iconPath)} alt="" style={{ width: 20, height: 20 }} />
                      </span>
                    ) : (
                      <span className={styles.tableAppIcon}>{conn.appIcon}</span>
                    )}
                    <span className={styles.tableAppName}>{conn.appName}</span>
                  </span>
                  {/* Task 7.6: Show accountIdentifier for OAuth, displayName for manual */}
                  <span className={styles.tableDisplayName}>
                    {conn.authType === 'oauth' && conn.accountIdentifier ? (
                      <span className={styles.accountIdentifier}>{conn.accountIdentifier}</span>
                    ) : (
                      conn.displayName
                    )}
                  </span>
                  <span><StatusBadge status={conn.status} /></span>
                  <span className={styles.tableLastUsed}>{relativeTime(conn.lastUsedAt)}</span>
                  <span className={styles.tableActions}>
                    <button
                      className={`${styles.actionBtn} ${conn.status === 'needs_reauth' ? styles.actionBtnReauth : ''}`}
                      onClick={() => handleReconnect(conn)}
                      title={conn.status === 'needs_reauth' ? 'Re-authenticate required' : t("reconnect")}
                    >
                      {conn.status === 'needs_reauth' ? 'Re-authenticate' : t("reconnect")}
                    </button>
                    <button
                      className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                      onClick={() => handleRevoke(conn)}
                      title={t("revoke")}
                    >
                      {t("revoke")}
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Available Apps ── */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>{t("available")}</p>
        {loadingApps ? (
          <p className={styles.emptyMsg}>{tCommon("loading")}...</p>
        ) : (
          <div className={styles.appGrid}>
            {apps.map(app => (
              <div key={app.id} className={styles.appCard}>
                <div className={styles.appCardTop}>
                  {app.iconPath ? (
                    <div className={styles.appIcon} data-brand={app.id.toLowerCase()}>
                      <img src={asset(app.iconPath)} alt="" style={{ width: 32, height: 32 }} />
                    </div>
                  ) : (
                    <div className={styles.appIcon}>{app.icon}</div>
                  )}
                  <div>
                    <p className={styles.appName}>{app.name}</p>
                    {app.categories.length > 0 && (
                      <p className={styles.appCategory}>{app.categories[0]}</p>
                    )}
                  </div>
                </div>
                <p className={styles.appDesc}>{app.description}</p>
                {/* OAuth apps always show ProviderButton, manual apps show ConnectModal */}
                {app.authType === 'oauth' ? (
                  <ProviderButton app={app} onPopupOpened={startConnectionPolling} />
                ) : (
                  <button
                    className={styles.connectBtn}
                    onClick={() => setConnectingApp(app)}
                  >
                    {connectedAppIds.has(app.id) ? t("addAnother") : t("connect")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {connectingApp && (
        <ConnectModal
          app={connectingApp}
          onClose={() => setConnectingApp(null)}
          onSaved={fetchConnections}
        />
      )}
      {reconnectTarget && (
        <ConnectModal
          app={reconnectTarget.app}
          existingId={reconnectTarget.connId}
          onClose={() => setReconnectTarget(null)}
          onSaved={fetchConnections}
        />
      )}
    </div>
  )
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: 'rgba(255,255,255,0.4)' }}>Loading...</div>}>
      <IntegrationsContent />
    </Suspense>
  )
}
