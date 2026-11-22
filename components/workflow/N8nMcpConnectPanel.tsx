'use client'

/**
 * "Connect n8n through MCP" — sits under the existing instance URL + API key
 * form in ActivationModal, never inside it, so the old deploy flow is
 * untouched (it must not be nested in that <form> either). One connection per
 * user; the token is write-only and only ever lives in this component's local
 * state until a request has been sent. Access follows usable credits, not the
 * plan tier (hooks/useN8nMcpAccess); the backend enforces it with a 402.
 * Plan: docs/N8N-MCP-CONNECTION-PLAN-2026-11.md.
 */

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { AGENT_ROSTER } from '@/lib/agentRoster'
import { useN8nMcpAccess } from '@/hooks/useN8nMcpAccess'
import {
  connectN8nMcp,
  disconnectN8nMcp,
  getN8nMcpConnection,
  n8nMcpErrorKind,
  N8nMcpConnectionError,
  reverifyN8nMcp,
  replaceN8nMcpToken,
  updateN8nMcpAgents,
  updateN8nMcpTools,
  type N8nMcpConnection,
} from '@/lib/n8nMcpConnection'
import styles from './N8nMcpConnectPanel.module.css'

type Busy = null | 'connect' | 'reverify' | 'token' | 'tools' | 'agents' | 'disconnect'

export function N8nMcpConnectPanel() {
  const t = useTranslations('n8nMcp')
  const locale = useLocale()
  const access = useN8nMcpAccess()

  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [connection, setConnection] = useState<N8nMcpConnection | null>(null)
  const [expanded, setExpanded] = useState(false)

  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [replacingToken, setReplacingToken] = useState(false)
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false)
  const [agentDraft, setAgentDraft] = useState<string[]>([])
  const [agentsSaved, setAgentsSaved] = useState(false)

  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getN8nMcpConnection()
      .then((s) => {
        if (cancelled) return
        setConnection(s.connection)
        setAgentDraft(s.connection?.agent_types ?? [])
        if (s.connection) setUrl(s.connection.url)
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const apply = useCallback((next: N8nMcpConnection) => {
    setConnection(next)
    setAgentDraft(next.agent_types)
  }, [])

  const describeError = useCallback(
    (err: unknown, context: 'host' | 'agent' = 'host'): string => {
      const kind = n8nMcpErrorKind(err)
      if (kind === 'verification') {
        return t('errors.verification', { reason: (err as N8nMcpConnectionError).message })
      }
      if (kind === 'forbidden') return t(context === 'agent' ? 'errors.forbiddenAgent' : 'errors.forbiddenHost')
      return t(`errors.${kind}`)
    },
    [t],
  )

  /** Runs a request; a 422 means the connection WAS saved, so it is shown
   *  inline (status + reason) instead of being dropped. */
  const run = async (
    kind: Exclude<Busy, null>,
    fn: () => Promise<N8nMcpConnection>,
    context: 'host' | 'agent' = 'host',
  ) => {
    setBusy(kind)
    setError(null)
    try {
      apply(await fn())
      if (kind === 'connect' || kind === 'token') {
        setToken('')
        setReplacingToken(false)
      }
      return true
    } catch (err) {
      if (err instanceof N8nMcpConnectionError && err.status === 422) {
        if (err.connection) apply(err.connection)
        setToken('')
        setReplacingToken(false)
      }
      setError(describeError(err, context))
      return false
    } finally {
      setBusy(null)
    }
  }

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim() || !token.trim() || busy) return
    void run('connect', () => connectN8nMcp({ url: url.trim(), token: token.trim() }))
  }

  const handleReplaceToken = (e: React.FormEvent) => {
    e.preventDefault()
    if (!token.trim() || busy) return
    void run('token', () => replaceN8nMcpToken(token.trim()))
  }

  const handleToggleTool = (name: string, on: boolean) => {
    if (!connection || busy) return
    const next = on
      ? [...connection.enabled_tools, name]
      : connection.enabled_tools.filter((n) => n !== name)
    void run('tools', () => updateN8nMcpTools(next))
  }

  const handleSaveAgents = async () => {
    setAgentsSaved(false)
    if (await run('agents', () => updateN8nMcpAgents(agentDraft), 'agent')) setAgentsSaved(true)
  }

  const handleDisconnect = async () => {
    setBusy('disconnect')
    setError(null)
    try {
      await disconnectN8nMcp()
      setConnection(null)
      setAgentDraft([])
      setUrl('')
      setToken('')
      setConfirmingDisconnect(false)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(null)
    }
  }

  // Nothing to show until we know; a failed credit lookup with no connection
  // shows nothing rather than a wrong "no credits" message.
  if (!loaded || access === 'loading') return null
  if (loadFailed) return <section className={styles.panel}><p className={styles.error} role="alert">{t('errors.load')}</p></section>
  if (!connection && access === 'unknown') return null

  if (!connection && access === 'no_credit') {
    return (
      <section className={styles.panel} aria-label={t('title')}>
        <h3 className={styles.title}>{t('title')}</h3>
        <p className={styles.sectionTitle}>{t('noCredit.title')}</p>
        <p className={styles.summary}>{t('noCredit.body')}</p>
        <div className={styles.actions}>
          <Link href="/dashboard/subscriptions" className={`${styles.btn} ${styles.btnPrimary}`}>
            {t('noCredit.cta')}
          </Link>
        </div>
      </section>
    )
  }

  const phase1 = connection?.tools.filter((x) => x.available) ?? []
  const lockedTools = connection?.tools.filter((x) => !x.available) ?? []
  const statusClass =
    connection?.status === 'verified'
      ? styles.badgeVerified
      : connection?.status === 'verification_failed'
        ? styles.badgeFailed
        : styles.badgePending
  const agentsChanged =
    connection &&
    (agentDraft.length !== connection.agent_types.length ||
      agentDraft.some((a) => !connection.agent_types.includes(a)))

  const tokenField = (
    <div className={styles.field}>
      <label className={styles.label} htmlFor="n8n-mcp-token">{t('fields.token')}</label>
      <div className={styles.row}>
        <input
          id="n8n-mcp-token"
          type={showToken ? 'text' : 'password'}
          className={styles.input}
          placeholder={t('fields.tokenPlaceholder')}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="button" className={styles.btn} onClick={() => setShowToken((v) => !v)}>
          {showToken ? t('fields.hideToken') : t('fields.showToken')}
        </button>
      </div>
    </div>
  )

  return (
    <section className={styles.panel} aria-label={t('title')}>
      <div className={styles.head}>
        <h3 className={styles.title}>{t('title')}</h3>
        {!connection && (
          <button
            type="button"
            className={styles.btn}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? t('close') : t('open')}
          </button>
        )}
      </div>

      {!connection && !expanded && <p className={styles.summary}>{t('summary')}</p>}

      {(connection || expanded) && (
        <div className={styles.body}>
          {connection && access === 'no_credit' && (
            <p className={styles.notice} role="status">
              {t('creditsLowConnected')}{' '}
              <Link href="/dashboard/subscriptions" className={styles.topUp}>{t('noCredit.cta')}</Link>
            </p>
          )}

          <details className={styles.help} open={!connection}>
            <summary>{t('help.title')}</summary>
            <p className={styles.helpStrong}>{t('help.tokenIsNotApiKey')}</p>
            <ol>
              <li>{t('help.step1')}</li>
              <li>{t('help.step2')}</li>
              <li>{t('help.step3')}</li>
              <li>{t('help.step4')}</li>
            </ol>
            <p>{t('help.dedicatedAccount')}</p>
            <p>{t('help.https')}</p>
            <p>{t('help.aivoryInstance')}</p>
          </details>

          {error && <p className={styles.error} role="alert">{error}</p>}

          {!connection && (
            <form onSubmit={handleConnect} className={styles.body}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="n8n-mcp-url">{t('fields.url')}</label>
                <input
                  id="n8n-mcp-url"
                  type="text"
                  className={styles.input}
                  placeholder={t('fields.urlPlaceholder')}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  autoComplete="url"
                  spellCheck={false}
                />
              </div>
              {tokenField}
              <div className={styles.actions}>
                <button
                  type="submit"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  disabled={!url.trim() || !token.trim() || busy !== null}
                >
                  {busy === 'connect' ? t('actions.connecting') : t('actions.connect')}
                </button>
              </div>
            </form>
          )}

          {connection && (
            <>
              <div className={styles.statusLine}>
                <span className={`${styles.badge} ${statusClass}`} role="status">
                  {t(`status.${connection.status}`)}
                </span>
                {connection.tool_count !== null && <span>{t('status.toolCount', { count: connection.tool_count })}</span>}
                <span>
                  {connection.last_verified_at
                    ? t('status.lastVerified', {
                        date: new Date(connection.last_verified_at).toLocaleString(locale),
                      })
                    : t('status.neverVerified')}
                </span>
              </div>
              <span className={styles.mono}>{connection.url}</span>

              {connection.status === 'verification_failed' && (
                <div className={styles.error}>
                  <strong>{t('failure.title')}</strong>
                  {connection.last_verify_error ? `: ${connection.last_verify_error}` : ''}
                  <br />
                  {t('failure.saved')}
                  <br />
                  {t('failure.hints')}
                </div>
              )}

              {replacingToken ? (
                <form onSubmit={handleReplaceToken} className={styles.body}>
                  {tokenField}
                  <div className={styles.actions}>
                    <button
                      type="submit"
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      disabled={!token.trim() || busy !== null}
                    >
                      {busy === 'token' ? t('actions.connecting') : t('actions.saveToken')}
                    </button>
                    <button
                      type="button"
                      className={styles.btn}
                      onClick={() => { setReplacingToken(false); setToken('') }}
                    >
                      {t('actions.cancel')}
                    </button>
                  </div>
                </form>
              ) : (
                <div className={styles.actions}>
                  <button type="button" className={styles.btn} disabled={busy !== null} onClick={() => void run('reverify', reverifyN8nMcp)}>
                    {busy === 'reverify' ? t('actions.connecting') : t('actions.reverify')}
                  </button>
                  <button type="button" className={styles.btn} disabled={busy !== null} onClick={() => setReplacingToken(true)}>
                    {t('actions.replaceToken')}
                  </button>
                  {confirmingDisconnect ? (
                    <>
                      <span className={styles.muted} role="alert">{t('actions.confirmDisconnect')}</span>
                      <button type="button" className={`${styles.btn} ${styles.btnDanger}`} disabled={busy !== null} onClick={() => void handleDisconnect()}>
                        {t('actions.confirmYes')}
                      </button>
                      <button type="button" className={styles.btn} onClick={() => setConfirmingDisconnect(false)}>
                        {t('actions.cancel')}
                      </button>
                    </>
                  ) : (
                    <button type="button" className={`${styles.btn} ${styles.btnDanger}`} disabled={busy !== null} onClick={() => setConfirmingDisconnect(true)}>
                      {t('actions.disconnect')}
                    </button>
                  )}
                </div>
              )}

              <div className={styles.field}>
                <h4 className={styles.sectionTitle}>
                  {t('tools.title')}
                  {phase1.length > 0 && (
                    <> · {t('tools.enabledCount', { enabled: phase1.filter((x) => connection.enabled_tools.includes(x.name)).length, total: phase1.length })}</>
                  )}
                </h4>
                <p className={styles.muted}>{t('tools.help')}</p>
                {phase1.length === 0 ? (
                  connection.status === 'verified' && <p className={styles.muted}>{t('tools.empty')}</p>
                ) : (
                  <ul className={styles.list}>
                    {phase1.map((tool) => (
                      <li key={tool.name} className={styles.item}>
                        <input
                          id={`n8n-mcp-tool-${tool.name}`}
                          type="checkbox"
                          checked={connection.enabled_tools.includes(tool.name)}
                          disabled={busy !== null}
                          onChange={(e) => handleToggleTool(tool.name, e.target.checked)}
                        />
                        <label htmlFor={`n8n-mcp-tool-${tool.name}`}>
                          <div className={styles.itemName}>{tool.name}</div>
                          {tool.description && <div className={styles.itemDesc}>{tool.description}</div>}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                {lockedTools.length > 0 && (
                  <details className={styles.help}>
                    <summary>{t('tools.lockedTitle', { count: lockedTools.length })}</summary>
                    <p>{t('tools.lockedHelp')}</p>
                    <ul className={styles.list}>
                      {lockedTools.map((tool) => (
                        <li key={tool.name} className={`${styles.item} ${styles.locked}`} data-locked="true">
                          <span aria-hidden="true">🔒</span>
                          <div>
                            <div className={styles.itemName}>{tool.name}</div>
                            {tool.description && <div className={styles.itemDesc}>{tool.description}</div>}
                          </div>
                          <span className={styles.lockTag}>{t('tools.locked')}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>

              <div className={styles.field}>
                <h4 className={styles.sectionTitle}>{t('agents.title')}</h4>
                <p className={styles.muted}>{t('agents.help')}</p>
                <ul className={styles.list}>
                  {AGENT_ROSTER.map((agent) => (
                    <li key={agent.type} className={styles.item}>
                      <input
                        id={`n8n-mcp-agent-${agent.type}`}
                        type="checkbox"
                        checked={agentDraft.includes(agent.type)}
                        disabled={busy !== null}
                        onChange={(e) => {
                          setAgentsSaved(false)
                          setAgentDraft((cur) =>
                            e.target.checked ? [...cur, agent.type] : cur.filter((a) => a !== agent.type),
                          )
                        }}
                      />
                      <label htmlFor={`n8n-mcp-agent-${agent.type}`}>
                        <div className={styles.itemName}>{agent.name}</div>
                        <div className={styles.itemDesc}>{agent.title}</div>
                      </label>
                    </li>
                  ))}
                </ul>
                {connection.agent_types.length === 0 && !agentsChanged && <p className={styles.muted}>{t('agents.none')}</p>}
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.btn}
                    disabled={!agentsChanged || busy !== null}
                    onClick={() => void handleSaveAgents()}
                  >
                    {t('agents.save')}
                  </button>
                  {agentsSaved && !agentsChanged && <span className={styles.muted} role="status">{t('agents.saved')}</span>}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

export default N8nMcpConnectPanel
