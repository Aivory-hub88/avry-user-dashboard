/**
 * AddWithCopilotPanel — "Aivory Node Copilot"
 *
 * Two jobs, one modal:
 *  1. Setup tab — configuration copilot: shows an n8n deploy-readiness
 *     checklist for the node, lets the user describe the desired config in
 *     plain language, previews the proposed changes, then applies them.
 *  2. Add step tab — generate follow-up steps after this node (the original
 *     "Add with Aivory" behaviour).
 */

'use client'

import React, { useMemo, useState, useCallback } from 'react'
import type { Node } from '@xyflow/react'
import { AivoryWorkflowSpec, WorkflowStep } from '@/types/workflows'
import type { WorkflowNodeData, NodeConfig } from '@/types/workflow-node'
import { useWorkflowExtend } from '@/hooks/useWorkflowExtend'
import { useNodeConfigCopilot } from '@/hooks/useNodeConfigCopilot'
import { QUICK_ACTION_PRESETS, getPresetInstruction } from '@/config/workflowPresets'
import {
  extractConfigFromNode, getDeployChecklist, getNodeTypeLabel, summarizeConfig,
} from './inspector/nodeConfigUtils'
import { asset } from '@/lib/asset'
import styles from './AddWithCopilotPanel.module.css'

export interface AddWithCopilotPanelProps {
  workflow: AivoryWorkflowSpec | null
  sourceNode: Node<WorkflowNodeData>
  onApply: (result: { newSteps: WorkflowStep[]; newEdges: any[] }) => void
  onApplyConfig: (config: NodeConfig) => void
  onOpenInspector: () => void
  onCancel: () => void
  onManualAdd: () => void
}

type Tab = 'setup' | 'extend'

// ── Per-node-type copy for the setup tab ──────────────────────
const SETUP_SUGGESTIONS: Record<string, string[]> = {
  httpRequest: [
    'GET JSON from a REST API',
    'POST with a Bearer token',
    'Send form data with an API key header',
  ],
  webhook: ['Receive POSTs at /new-lead', 'Respond immediately with 200'],
  schedule: ['Every day at 9am Jakarta time', 'Every 15 minutes'],
  aiStep: ['Summarize the incoming data', 'Classify priority as high / medium / low'],
  ifCondition: ['Continue only when status is success', 'Branch when amount is above 1000'],
  editFields: ['Map name and email from the previous step'],
  httpResponse: ['Return 200 with a JSON result'],
  generic: ['Set this step up for production use'],
}

const SETUP_PLACEHOLDER: Record<string, string> = {
  httpRequest: 'e.g. Call the Salesforce contacts API with GET, auth via Bearer token',
  webhook: 'e.g. Accept POST requests at /onboarding and respond immediately',
  schedule: 'e.g. Run every weekday at 8am Jakarta time',
  aiStep: 'e.g. Summarize the ticket and extract customer sentiment',
  ifCondition: 'e.g. Only continue when the response status is 200',
  editFields: 'e.g. Keep only name, email and company fields',
  httpResponse: 'e.g. Return 201 with the created record as JSON',
  generic: 'Describe what this step should do and how it connects',
}

/** Compact value renderer for the config summary + diff rows. */
function fmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (Array.isArray(v)) return v.length === 0 ? '—' : `${v.length} item${v.length === 1 ? '' : 's'}`
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 40)
  const s = String(v)
  return s.length > 48 ? `${s.slice(0, 45)}…` : s
}

export const AddWithCopilotPanel: React.FC<AddWithCopilotPanelProps> = ({
  workflow, sourceNode, onApply, onApplyConfig, onOpenInspector, onCancel, onManualAdd,
}) => {
  const [tab, setTab] = useState<Tab>('setup')

  const data = sourceNode.data
  const nodeTitle = data.title || data.label || 'Untitled step'
  const typeLabel = useMemo(() => getNodeTypeLabel(data), [data])
  const config = useMemo(() => extractConfigFromNode(data), [data])
  const checklist = useMemo(() => getDeployChecklist(config, data), [config, data])
  const blockers = checklist.filter(i => !i.ok && i.severity === 'error').length
  const warnings = checklist.filter(i => !i.ok && i.severity === 'warn').length
  const summary = useMemo(() => summarizeConfig(config), [config])

  // ── Setup tab state ──
  const configCopilot = useNodeConfigCopilot()
  const [setupIntent, setSetupIntent] = useState('')
  const suggestions = SETUP_SUGGESTIONS[config.type] ?? SETUP_SUGGESTIONS.generic

  const configDiff = useMemo(() => {
    if (!configCopilot.result) return []
    const next = configCopilot.result.config as Record<string, any>
    const cur = config as Record<string, any>
    return Object.keys(next)
      .filter(k => k !== 'type' && JSON.stringify(next[k]) !== JSON.stringify(cur[k]))
      .map(k => ({ key: k, from: fmt(cur[k]), to: fmt(next[k]) }))
  }, [configCopilot.result, config])

  const handleAskConfigure = useCallback(() => {
    configCopilot.askConfigure({ nodeTitle, currentConfig: config, intent: setupIntent, workflow })
  }, [configCopilot, nodeTitle, config, setupIntent, workflow])

  const handleApplyConfig = useCallback(() => {
    if (!configCopilot.result) return
    onApplyConfig(configCopilot.result.config)
    configCopilot.clear()
    onCancel()
  }, [configCopilot, onApplyConfig, onCancel])

  // ── Extend tab state ──
  const { result, loading, error, extendWorkflow, clearExtension } = useWorkflowExtend()
  const [instruction, setInstruction] = useState('')

  const sourceStepForPresets = useMemo<WorkflowStep>(() => ({
    id: sourceNode.id,
    appId: data.appId ?? config.type,
    actionId: (data as any).action ?? '',
    connectionId: data.connectionId ?? '',
    inputs: {},
    position: { x: 0, y: 0 },
    type: data.category === 'ai' ? 'ai' : 'action',
  } as WorkflowStep), [sourceNode.id, data, config.type])

  const handleAskExtend = useCallback(() => {
    if (!workflow) return
    extendWorkflow(workflow, sourceNode.id, instruction)
  }, [extendWorkflow, workflow, sourceNode.id, instruction])

  const handleApplySteps = useCallback(() => {
    if (result) { onApply(result); clearExtension() }
  }, [result, onApply, clearExtension])

  const handleClose = useCallback(() => {
    clearExtension(); configCopilot.clear(); onCancel()
  }, [clearExtension, configCopilot, onCancel])

  const busy = loading || configCopilot.loading

  return (
    <div className={styles.panel} role="dialog" aria-label="Aivory node copilot">
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <img src={asset('/Aivory_Avatar.svg')} alt="" className={styles.headerAvatar} />
          <div className={styles.headerText}>
            <span className={styles.headerTitle}>{nodeTitle}</span>
            <span className={styles.headerSub}>{typeLabel} · Aivory copilot</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          <span className={`${styles.readyPill} ${blockers === 0 ? styles.readyOk : styles.readyBlocked}`}>
            {blockers === 0 ? 'Ready to deploy' : `${blockers} blocker${blockers === 1 ? '' : 's'}`}
          </span>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'setup' ? styles.tabActive : ''}`} onClick={() => setTab('setup')}>
          Setup configuration
        </button>
        <button className={`${styles.tab} ${tab === 'extend' ? styles.tabActive : ''}`} onClick={() => setTab('extend')}>
          Add next step
        </button>
      </div>

      <div className={styles.body}>
        {tab === 'setup' ? (
          configCopilot.result ? (
            /* ── Setup: AI result preview ── */
            <>
              <p className={styles.resultSummary}>{configCopilot.result.summary}</p>
              {configDiff.length === 0 ? (
                <p className={styles.mutedNote}>No settings changed — the node already matches this request.</p>
              ) : (
                <div className={styles.diffList}>
                  {configDiff.map(d => (
                    <div key={d.key} className={styles.diffRow}>
                      <span className={styles.diffKey}>{d.key}</span>
                      <span className={styles.diffFrom}>{d.from}</span>
                      <svg className={styles.diffArrow} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>
                      <span className={styles.diffTo}>{d.to}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.actions}>
                <button className={styles.primaryBtn} onClick={handleApplyConfig} disabled={configDiff.length === 0}>
                  Apply configuration
                </button>
                <button className={styles.ghostBtn} onClick={() => configCopilot.clear()}>Back</button>
              </div>
            </>
          ) : (
            /* ── Setup: checklist + intent input ── */
            <>
              <div className={styles.sectionLabel}>Deploy readiness</div>
              <div className={styles.checklist}>
                {checklist.map((item, i) => (
                  <div key={i} className={styles.checkRow}>
                    <span className={`${styles.checkIcon} ${item.ok ? styles.checkOk : item.severity === 'error' ? styles.checkError : styles.checkWarn}`}>
                      {item.ok ? (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                      ) : '!'}
                    </span>
                    <div className={styles.checkText}>
                      <span className={styles.checkLabel}>{item.label}</span>
                      {!item.ok && item.hint && <span className={styles.checkHint}>{item.hint}</span>}
                    </div>
                  </div>
                ))}
              </div>

              {summary.length > 0 && (
                <div className={styles.configSummary}>
                  {summary.map(s => (
                    <span key={s.key} className={styles.configChip}>
                      <span className={styles.configChipKey}>{s.key}</span>{fmt(s.value)}
                    </span>
                  ))}
                </div>
              )}

              <div className={styles.sectionLabel}>Tell Aivory how to set it up</div>
              <div className={styles.suggestions}>
                {suggestions.map(s => (
                  <button key={s} className={styles.suggestionChip} onClick={() => setSetupIntent(s)} disabled={busy}>
                    {s}
                  </button>
                ))}
              </div>
              <textarea
                className={styles.textarea}
                placeholder={SETUP_PLACEHOLDER[config.type] ?? SETUP_PLACEHOLDER.generic}
                value={setupIntent}
                onChange={e => setSetupIntent(e.target.value)}
                disabled={busy}
                rows={3}
              />

              {configCopilot.error && <div className={styles.error}>{configCopilot.error}</div>}

              <div className={styles.actions}>
                <button
                  className={styles.primaryBtn}
                  onClick={handleAskConfigure}
                  disabled={busy || !setupIntent.trim()}
                >
                  {configCopilot.loading ? <span className={styles.spinner} /> : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 5.7L19.6 9l-5.7 1.9L12 16.6l-1.9-5.7L4.4 9l5.7-1.3L12 2zm7 12l.95 2.85L22.8 18l-2.85.95L19 21.8l-.95-2.85L15.2 18l2.85-1.15L19 14z"/></svg>
                  )}
                  {configCopilot.loading ? 'Configuring…' : 'Configure with Aivory'}
                </button>
                <button className={styles.ghostBtn} onClick={onOpenInspector} disabled={busy}>
                  Configure manually
                </button>
              </div>
            </>
          )
        ) : result ? (
          /* ── Extend: result preview ── */
          <>
            <p className={styles.resultSummary}>{result.summary}</p>
            <div className={styles.stepsList}>
              {result.newSteps.map((step, i) => (
                <div key={step.id} className={styles.stepRow}>
                  <span className={styles.stepNum}>{i + 1}</span>
                  <div className={styles.stepText}>
                    <span className={styles.stepApp}>{step.appId}</span>
                    <span className={styles.stepAction}>{step.actionId}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.actions}>
              <button className={styles.primaryBtn} onClick={handleApplySteps}>
                Add {result.newSteps.length} step{result.newSteps.length === 1 ? '' : 's'}
              </button>
              <button className={styles.ghostBtn} onClick={() => clearExtension()}>Back</button>
            </div>
          </>
        ) : (
          /* ── Extend: input ── */
          <>
            <div className={styles.sectionLabel}>Quick actions</div>
            <div className={styles.suggestions}>
              {QUICK_ACTION_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  className={styles.suggestionChip}
                  onClick={() => { const s = getPresetInstruction(preset.id, sourceStepForPresets); if (s) setInstruction(s) }}
                  disabled={busy}
                  title={preset.description}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className={styles.sectionLabel}>What should happen after this step?</div>
            <textarea
              className={styles.textarea}
              placeholder="e.g. Send a Slack notification with the result"
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              disabled={busy}
              rows={3}
            />

            {error && <div className={styles.error}>{error}</div>}
            {!workflow && (
              <div className={styles.mutedNote}>Save the workflow first so Aivory has the full context to extend it.</div>
            )}

            <div className={styles.actions}>
              <button
                className={styles.primaryBtn}
                onClick={handleAskExtend}
                disabled={busy || !instruction.trim() || !workflow}
              >
                {loading ? <span className={styles.spinner} /> : '+'}
                {loading ? 'Generating…' : 'Ask Aivory'}
              </button>
              <button className={styles.ghostBtn} onClick={onManualAdd} disabled={busy}>
                Manual step
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
