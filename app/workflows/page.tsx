'use client'
import { asset } from "@/lib/asset";

import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  loadWorkflows, updateWorkflow, deleteWorkflow, saveWorkflow, SavedWorkflow,
  useWorkflowList, createWorkflow, patchWorkflow, removeWorkflow,
  deactivateWorkflow,
} from '@/hooks/useWorkflows'
import { WorkflowCanvas as N8nWorkflowCanvas } from '@/components/workflow/WorkflowCanvas'
import { CopilotTogglePanel } from '@/components/workflow/CopilotTogglePanel'
import { WorkflowGenerationModal } from '@/components/workflow/WorkflowGenerationModal'
import { retrieveWorkflowSpec, clearWorkflowSpec, convertHandoffToNodes } from '@/lib/workflowHandoff'
import { StandardNodePalette } from '@/components/workflow/StandardNodePalette'
import { DynamicNodePalette } from '@/components/workflow/DynamicNodePalette'
import { clearCanvasState, loadCanvasState } from '@/hooks/useCanvasPersistence'
import { reactFlowToN8n } from '@/lib/n8nMapper'
import { ActivationModal } from '@/components/workflow/ActivationModal'
import { saveCredentials, N8nCredentials } from '@/lib/workflows/credentialStore'
import { detectNodeIntent } from '@/lib/workflows/nodeMapper'
import { convertToN8nWorkflow } from '@/lib/workflowConverter'
import { fetchTemplateById } from '@/lib/templates/resolveTemplate'
import { templateToCanvas } from '@/lib/templates/templateToCanvas'
import type { AivoryWorkflowSpec } from '@/types/workflow'
import { useRouterContext } from '@/contexts/RouterContext'
import { ContinuedFromConsole } from '@/components/routing/ContinuedFromConsole'
import styles from './workflows.module.css'

// ── Adapter: AivoryWorkflowSpec → SavedWorkflow ──────────
// Lets the canvas/editor work with either shape.
function specToSaved(spec: AivoryWorkflowSpec): SavedWorkflow {
  return {
    workflow_id: spec.id,
    title: spec.title,
    status: spec.status,
    source: spec.source,
    company_name: spec.company_name,
    trigger: spec.trigger,
    steps: spec.steps,
    integrations: spec.integrations,
    estimated_time: spec.estimated_time,
    automation_percentage: spec.automation_percentage,
    error_handling: spec.error_handling,
    notes: spec.notes,
    blueprintId: spec.blueprintId,
    n8nId: spec.n8nId,
    n8n_workflow_id: spec.n8n_workflow_id,
    n8n_url: spec.n8n_url,
    created_at: spec.createdAt,
  }
}

function savedToSpec(wf: SavedWorkflow): Partial<AivoryWorkflowSpec> {
  return {
    title: wf.title,
    status: wf.status,
    source: wf.source,
    company_name: wf.company_name,
    trigger: wf.trigger,
    steps: wf.steps,
    integrations: wf.integrations,
    estimated_time: wf.estimated_time,
    automation_percentage: wf.automation_percentage,
    error_handling: wf.error_handling,
    notes: wf.notes,
    blueprintId: wf.blueprintId,
    n8nId: wf.n8nId,
    n8n_workflow_id: wf.n8n_workflow_id,
    n8n_url: wf.n8n_url,
  }
}

// ── Outline SVG icons ────────────────────────────────────
// Most icons moved to WorkflowNodes.tsx, keeping only those used in toolbar/modals
const Icons = {
  sparkle: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
    </svg>
  ),
  play: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  ),
  download: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  trash: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  ),
  moreH: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
    </svg>
  ),
  close: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  edit: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  undo: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6"/>
      <path d="M3 13C5.5 6.5 13 4 18 8s5 12 0 16"/>
    </svg>
  ),
  save: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </svg>
  ),
  workflow: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="6" height="6" rx="1"/>
      <rect x="15" y="15" width="6" height="6" rx="1"/>
      <path d="M9 6h3a3 3 0 0 1 3 3v6"/>
      <path d="M18 15V9"/>
    </svg>
  ),
  clock: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  aivoryAvatar: (
    <img src={asset("/Aivory_Avatar.svg")} alt="Aivory" style={{ width: '18px', height: '18px' }} />
  ),
  robot: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2"/>
      <circle cx="12" cy="5" r="2"/>
      <path d="M12 7v4"/>
      <line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/>
    </svg>
  ),
  stop: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="6" width="12" height="12" rx="1"/>
    </svg>
  ),
}

// ── Step type → icon mapping ─────────────────────────────
// Moved to WorkflowNodes.tsx
function getStepIcon(type: string) {
  // Placeholder - actual implementation in WorkflowNodes.tsx
  return Icons.sparkle
}

const STEP_TYPE_LABELS: Record<string, string> = {
  ingestion: 'Collect Data',
  ai_processing: 'AI Analysis',
  decision: 'Decision',
  execution: 'Run Action',
  notification: 'Send Alert',
}

function guessStepType(action: string): string {
  // Placeholder - actual implementation in WorkflowNodes.tsx
  return 'execution'
}

// ── Derive preview vs active ─────────────────────────────
// A workflow is "active" only when it has been deployed to n8n (n8n_workflow_id set)
// and its status is 'active'. Everything else is "preview".
function isActiveWorkflow(wf: SavedWorkflow): boolean {
  return wf.status === 'active' && !!wf.n8n_workflow_id
}

// ── Status badge ─────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

// ── Preview / Active mode badge ──────────────────────────
function ModeBadge({ wf }: { wf: SavedWorkflow }) {
  const active = isActiveWorkflow(wf)
  return (
    <span style={{
      fontSize: 9,
      fontWeight: 700,
      padding: '2px 6px',
      borderRadius: 4,
      whiteSpace: 'nowrap',
      letterSpacing: '0.2px',
      background: active ? '#282827' : 'rgba(255,255,255,0.04)',
      color: active ? '#a8a6a2' : '#a8a6a2',
      border: `1px solid ${active ? '#666864' : 'rgba(255,255,255,0.07)'}`,
    }}>
      {active ? 'Active' : 'Preview'}
    </span>
  )
}

// ── Trigger card ─────────────────────────────────────────
// Moved to WorkflowNodes.tsx

// ── Connector arrow ──────────────────────────────────────
// Moved to React Flow edges

// ── Step card ────────────────────────────────────────────
// Moved to WorkflowNodes.tsx

// ── Right panel editor ───────────────────────────────────
interface EditTarget { type: 'trigger' | 'step'; index?: number }

function RightPanel({
  workflow, editTarget, onSave, onClose
}: {
  workflow: SavedWorkflow
  editTarget: EditTarget
  onSave: (updated: SavedWorkflow) => void
  onClose: () => void
}) {
  const t = useTranslations("workflow")
  const isTrigger = editTarget.type === 'trigger'
  const step = !isTrigger && editTarget.index !== undefined ? workflow.steps[editTarget.index] : null

  const [action, setAction] = useState(step?.action ?? workflow.trigger)
  const [tool, setTool] = useState(step?.tool ?? '')
  const [output, setOutput] = useState(step?.output ?? '')
  const [showStepAI, setShowStepAI] = useState(false)
  const [showCredSection, setShowCredSection] = useState(false)
  const [showApiKeyPassword, setShowApiKeyPassword] = useState(false)
  const [showParamSection, setShowParamSection] = useState(false)
  const [jsonError, setJsonError] = useState('')

  // API & Credentials state
  const [integration, setIntegration] = useState((step?.config?.integration as string) ?? '')
  const [apiUrl, setApiUrl] = useState((step?.config?.url as string) ?? '')
  const [httpMethod, setHttpMethod] = useState((step?.config?.method as string) ?? 'GET')
  const [apiKey, setApiKey] = useState((step?.config?.apiKey as string) ?? '')
  const [credName, setCredName] = useState((step?.credentials?.name as string) ?? '')
  const [additionalParams, setAdditionalParams] = useState((step?.config?.additionalFields as string) ?? '')

  // Connection selector state
  const [connections, setConnections] = useState<Array<{ id: string; displayName: string; appId: string; appName: string; status: string }>>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState(step?.connectionId ?? '')
  useEffect(() => {
    fetch('/api/integrations/connections')
      .then(r => r.ok ? r.json() : [])
      .then((all: Array<{ id: string; displayName: string; appId: string; appName: string; status: string }>) =>
        setConnections(all.filter(c => c.status === 'connected'))
      )
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (isTrigger) { 
      setAction(workflow.trigger)
      setTool('')
      setOutput('')
    } else if (step) { 
      setAction(step.action)
      setTool(step.tool)
      setOutput(step.output)
      setIntegration((step.config?.integration as string) ?? '')
      setApiUrl((step.config?.url as string) ?? '')
      setHttpMethod((step.config?.method as string) ?? 'GET')
      setApiKey((step.config?.apiKey as string) ?? '')
      setCredName((step.credentials?.name as string) ?? '')
      setAdditionalParams((step.config?.additionalFields as string) ?? '')
      setSelectedConnectionId(step.connectionId ?? '')
    }
  }, [editTarget, workflow])

  const handleSave = () => {
    if (isTrigger) {
      onSave({ ...workflow, trigger: action })
    } else if (editTarget.index !== undefined) {
      const newSteps = [...workflow.steps]
      const updatedStep = { ...newSteps[editTarget.index], action, tool, output }
      
      // Initialize config and credentials if not present
      if (!updatedStep.config) updatedStep.config = {}
      if (!updatedStep.credentials) updatedStep.credentials = {}
      
      // Save API & Credentials fields
      updatedStep.config.integration = integration
      updatedStep.config.url = apiUrl
      updatedStep.config.method = httpMethod
      updatedStep.config.apiKey = apiKey
      updatedStep.credentials.name = credName
      
      // Save connection
      if (selectedConnectionId) {
        updatedStep.connectionId = selectedConnectionId
        const conn = connections.find(c => c.id === selectedConnectionId)
        if (conn) updatedStep.appId = conn.appId
      } else {
        delete updatedStep.connectionId
        delete updatedStep.appId
      }
      
      // Only save additionalParams if valid JSON
      if (additionalParams.trim()) {
        try {
          JSON.parse(additionalParams)
          updatedStep.config.additionalFields = additionalParams
        } catch {
          // Invalid JSON, don't save
        }
      }
      
      newSteps[editTarget.index] = updatedStep
      onSave({ ...workflow, steps: newSteps })
    }
  }

  const handleStepAIApply = (updatedStep: SavedWorkflow['steps'][0]) => {
    setAction(updatedStep.action)
    setTool(updatedStep.tool)
    setOutput(updatedStep.output)
    setShowStepAI(false)
  }

  const validateJSON = (value: string) => {
    if (!value.trim()) {
      setJsonError('')
      return
    }
    try {
      JSON.parse(value)
      setJsonError('')
    } catch {
      setJsonError('Invalid JSON format')
    }
  }

  if (showStepAI && !isTrigger && step && editTarget.index !== undefined) {
    const StepAIEditor = require('@/components/StepAIEditor').StepAIEditor
    return (
      <div className={styles.rightPanel}>
        <div className={styles.rightPanelHeader}>
          <span className={styles.rightPanelTitle}>
            Edit Step {editTarget.index + 1} with AI
          </span>
          <button className={styles.rightPanelClose} onClick={() => setShowStepAI(false)} aria-label="Close">
            {Icons.close}
          </button>
        </div>
        <StepAIEditor
          step={step}
          stepIndex={editTarget.index}
          workflow={workflow}
          onClose={() => setShowStepAI(false)}
          onApply={handleStepAIApply}
        />
      </div>
    )
  }

  return (
    <div className={styles.rightPanel}>
      <div className={styles.rightPanelHeader}>
        <span className={styles.rightPanelTitle}>
          {isTrigger ? t('editTrigger') : `Edit Step ${(editTarget.index ?? 0) + 1}`}
        </span>
        <button className={styles.rightPanelClose} onClick={onClose} aria-label="Close">
          {Icons.close}
        </button>
      </div>
      <div className={styles.rightPanelFields}>
        <div className={styles.fieldLabelRow}>
          <label className={styles.fieldLabel}>{isTrigger ? 'When this happens...' : 'What happens'}</label>
          {!isTrigger && (
            <button 
              className={styles.fieldAIEditButton} 
              onClick={() => setShowStepAI(true)} 
              title={t('editWithAivoryDesc')}
              aria-label={t('editWithAivoryDesc')}
            >
              {Icons.aivoryAvatar}
              <span className={styles.fieldAIEditButtonLabel}>{t('editWithAivory')}</span>
            </button>
          )}
        </div>
        <span className={styles.fieldHelperText}>
          Describe what happens in this step in plain language. Example: 'Fetch client data from Salesforce when a new onboarding comes in.'
        </span>
        <textarea className={styles.fieldTextarea} value={action} onChange={e => setAction(e.target.value)} rows={3} />
        
        {!isTrigger && (
          <>
            <label className={styles.fieldLabel}>{t('toolService')}</label>
            <span className={styles.fieldHelperText}>
              Enter the tool or API used. Example: 'Salesforce REST API', 'SendGrid v3', 'SharePoint Graph API', or 'HTTP Custom API'.
            </span>
            <input className={styles.fieldInput} value={tool} onChange={e => setTool(e.target.value)} placeholder="e.g. Google Sheets, OpenAI, Slack" />
            
            <label className={styles.fieldLabel}>{t('whatProduces')}</label>
            <span className={styles.fieldHelperText}>
              Describe the output this step produces. Example: 'Complete client data in JSON format, ready for the next step.'
            </span>
            <input className={styles.fieldInput} value={output} onChange={e => setOutput(e.target.value)} placeholder="e.g. Enriched lead record" />

            {/* Connection Selector */}
            {connections.length > 0 && (
              <div className={styles.credField} style={{ marginBottom: 8 }}>
                <label className={styles.credFieldLabel}>{t('savedConnection')}</label>
                <span className={styles.credFieldHelper}>
                  Use a saved connection from your Integrations page, or fill in credentials manually below.
                </span>
                <select
                  className={styles.credSelect}
                  value={selectedConnectionId}
                  onChange={e => setSelectedConnectionId(e.target.value)}
                >
                  <option value="">-- None (manual credentials) --</option>
                  {connections.map(c => (
                    <option key={c.id} value={c.id}>{c.displayName} ({c.appName})</option>
                  ))}
                </select>
              </div>
            )}

            {/* API & Credentials Section */}
            <div 
              className={styles.credSectionHeader}
              onClick={() => setShowCredSection(!showCredSection)}
            >
              <span>{t('apiCredentials')}</span>
              <span className={`${styles.credSectionArrow} ${showCredSection ? styles.open : ''}`}>›</span>
            </div>

            {showCredSection && (
              <div>
                {/* Field 1: Integration */}
                <div className={styles.credField}>
                  <label className={styles.credFieldLabel}>{t('integration')}</label>
                  <span className={styles.credFieldHelper}>
                    Select the system being used. If it's not in the list, choose 'Custom'.
                  </span>
                  <select 
                    className={styles.credSelect}
                    value={integration}
                    onChange={e => setIntegration(e.target.value)}
                  >
                    <option value="">{t('selectIntegration')}</option>
                    <option value="Salesforce">Salesforce</option>
                    <option value="SharePoint">SharePoint</option>
                    <option value="SendGrid">SendGrid</option>
                    <option value="Slack">Slack</option>
                    <option value="OpenAI">OpenAI</option>
                    <option value="Notion">Notion</option>
                    <option value="HubSpot">HubSpot</option>
                    <option value="HTTP Custom API">HTTP Custom API</option>
                    <option value="Webhook">Webhook</option>
                    <option value="Database">Database</option>
                    <option value="Other">Other / Custom</option>
                  </select>
                </div>

                {/* Field 2: API URL */}
                <div className={styles.credField}>
                  <label className={styles.credFieldLabel}>{t('apiUrl')}</label>
                  <span className={styles.credFieldHelper}>
                    Enter the full URL of the API endpoint to call. Example: https://api.salesforce.com/v54/sobjects/Contact
                  </span>
                  <input 
                    className={styles.credInput}
                    type="text"
                    value={apiUrl}
                    onChange={e => setApiUrl(e.target.value)}
                    placeholder="https://api.example.com/v1/endpoint"
                  />
                </div>

                {/* Field 3: HTTP Method (only if URL is not empty) */}
                {apiUrl && (
                  <div className={styles.credField}>
                    <label className={styles.credFieldLabel}>{t('httpMethod')}</label>
                    <span className={styles.credFieldHelper}>
                      Select the request method this API uses.
                    </span>
                    <select 
                      className={styles.credSelect}
                      value={httpMethod}
                      onChange={e => setHttpMethod(e.target.value)}
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="PATCH">PATCH</option>
                      <option value="DELETE">DELETE</option>
                    </select>
                  </div>
                )}

                {/* Field 4: API Key */}
                <div className={styles.credField}>
                  <label className={styles.credFieldLabel}>{t('apiKeyOrToken')}</label>
                  <span className={styles.credFieldHelper}>
                    Enter an API key or Bearer token. This credential is only stored in your browser — it is never sent to Aivory servers.
                  </span>
                  <div className={styles.apiKeyRow}>
                    <input 
                      className={styles.credInput}
                      type={showApiKeyPassword ? 'text' : 'password'}
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder="sk-xxxx or Bearer eyJhbGc..."
                    />
                    <button 
                      className={styles.toggleVisBtn}
                      onClick={() => setShowApiKeyPassword(!showApiKeyPassword)}
                    >
                      {showApiKeyPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                {/* Field 5: Credential Name */}
                <div className={styles.credField}>
                  <label className={styles.credFieldLabel}>{t('credentialName')}</label>
                  <span className={styles.credFieldHelper}>
                    Give it a name so Aivory can reference it when building workflows. Example: 'Salesforce Production'.
                  </span>
                  <input 
                    className={styles.credInput}
                    type="text"
                    value={credName}
                    onChange={e => setCredName(e.target.value)}
                    placeholder="e.g. Salesforce Production"
                  />
                </div>

                {/* Field 6: Additional Parameters (sub-collapsible) */}
                <div className={styles.credField}>
                  <div 
                    className={styles.subSectionHeader}
                    onClick={() => setShowParamSection(!showParamSection)}
                  >
                    ADDITIONAL PARAMETERS (OPTIONAL) {showParamSection ? '›' : '›'}
                  </div>
                  {showParamSection && (
                    <>
                      <span className={styles.credFieldHelper}>
                        Add custom parameters in JSON format. Example: {'{'}  "timeout": 30, "version": "v2" {'}'}
                      </span>
                      <textarea 
                        className={styles.credTextarea}
                        value={additionalParams}
                        onChange={e => {
                          setAdditionalParams(e.target.value)
                          validateJSON(e.target.value)
                        }}
                        onBlur={() => validateJSON(additionalParams)}
                        rows={3}
                        placeholder='{ "key": "value" }'
                      />
                      {jsonError && <span className={styles.jsonError}>{jsonError}</span>}
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <button className={styles.saveChangesBtn} onClick={handleSave}>{t('saveChanges')}</button>
    </div>
  )
}

// ── Save Workflow modal ──────────────────────────────────
function SaveWorkflowModal({
  onClose, onSave
}: {
  onClose: () => void
  onSave: (versionName: string) => void
}) {
  const t = useTranslations("workflow")
  const [name, setName] = useState('v1.1')
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.saveModal} onClick={e => e.stopPropagation()}>
        <div className={styles.saveModalHeader}>
          <div className={styles.saveModalTitles}>
            <p className={styles.saveModalTitle}>{t('saveVersion')}</p>
            <p className={styles.saveModalSubtitle}>{t('saveVersionSubtitle')}</p>
          </div>
          <button className={styles.rightPanelClose} onClick={onClose} aria-label="Close">{Icons.close}</button>
        </div>
        <input
          className={styles.saveModalInput}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. v1.1 or Latest Draft"
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSave(name.trim()) }}
        />
        <div className={styles.saveModalActions}>
          <button className={`${styles.saveModalCancel} btn-style-a`} onClick={onClose}>Cancel</button>
          <button className={`${styles.saveModalConfirm} btn-style-b`} onClick={() => name.trim() && onSave(name.trim())}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────
function WorkflowsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations("workflow")

  // ── API-backed workflow list ─────────────────────────────
  const { workflows: apiWorkflows, refresh: refreshWorkflows } = useWorkflowList()
  // Also keep localStorage workflows (Blueprint page still writes there)
  const [localWorkflows, setLocalWorkflows] = useState<SavedWorkflow[]>([])
  // Merge: API first, then localStorage entries not already in API
  const workflows: SavedWorkflow[] = [
    ...apiWorkflows.map(specToSaved),
    ...localWorkflows.filter(lw => !apiWorkflows.find(aw => aw.id === lw.workflow_id)),
  ]

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [undoStack, setUndoStack] = useState<SavedWorkflow[]>([])
  const [activating, setActivating] = useState(false)
  const [activationModalOpen, setActivationModalOpen] = useState(false)
  const [activationLoading, setActivationLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [showActivateDropdown, setShowActivateDropdown] = useState(false)
  const [isWorkflowListCollapsed, setIsWorkflowListCollapsed] = useState(false) // default expanded
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [showGenerationModal, setShowGenerationModal] = useState(false)
  const [generationPrompt, setGenerationPrompt] = useState<string | null>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const activateRef = useRef<HTMLDivElement>(null)
  // Ref to inject nodes directly into the live canvas (used by Aivory generation)
  const canvasInjectRef = useRef<((nodes: any[], edges: any[]) => void) | null>(null)
  // Pending handoff nodes/edges to inject once the canvas mounts
  const pendingHandoffRef = useRef<{ nodes: any[]; edges: any[] } | null>(null)
  const [canvasCanUndo, setCanvasCanUndo] = useState(false)
  const undoCanvasRef = useRef<(() => void) | null>(null)

  const { pendingContext, clearPendingContext } = useRouterContext()
  const [routingNotice, setRoutingNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!pendingContext) return
    if (Date.now() - pendingContext.timestamp > 300000) { clearPendingContext(); return }
    if (pendingContext.targetRoute !== 'workflows') return
    setRoutingNotice(pendingContext.aiReplySummary || pendingContext.triggerMessage)
    clearPendingContext()
  }, [pendingContext, clearPendingContext])

  // ── Apps sidebar state ───────────────────────────────────
  const [apps, setApps] = useState<Array<{ id: string; name: string; description: string; icon: string; iconPath?: string; defaultAction?: string; categories: string[] }>>([])
  const [appsSearch, setAppsSearch] = useState('')
  const [appsCategory, setAppsCategory] = useState<string>('All')

  useEffect(() => {
    fetch('/api/integrations/apps')
      .then(r => r.ok ? r.json() : [])
      .then(setApps)
      .catch(() => {})
  }, [])

  const filteredApps = apps.filter(app => {
    const matchesSearch = app.name.toLowerCase().includes(appsSearch.toLowerCase()) || app.description.toLowerCase().includes(appsSearch.toLowerCase())
    const matchesCategory = appsCategory === 'All' || app.categories.includes(appsCategory)
    return matchesSearch && matchesCategory
  })

  const appCategories = ['All', ...Array.from(new Set(apps.flatMap(a => a.categories)))]

  const handleAppDragStart = (e: React.DragEvent, app: typeof apps[0]) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/aivory-app', JSON.stringify(app))
  }

  const selected = workflows.find(w => w.workflow_id === selectedId) ?? null

  // ── Onboarding empty state ───────────────────────────────
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (typeof window === 'undefined') return true
    return !localStorage.getItem('hasSeenWorkflowOnboarding')
  })

  // Keyboard shortcuts now handled by useCopilotPanel hook inside CopilotTogglePanel})
  // Load localStorage on mount; auto-select from ?selected param or first item
  useEffect(() => {
    const wfs = loadWorkflows()
    setLocalWorkflows(wfs)
    
    // Check if coming from console with handoff spec
    const fromConsole = searchParams?.get('fromConsole') === 'true'
    if (fromConsole) {
      const handoff = retrieveWorkflowSpec()
      if (handoff) {
        const handoffSpec = handoff.spec
        // Convert console steps + edges to React Flow nodes/edges
        const { nodes: rfNodes, edges: rfEdges } = convertHandoffToNodes(
          handoffSpec.steps as any,
          handoff.edges || []
        )

        // Create a minimal SavedWorkflow so the workflow appears in the list
        const newWorkflow: SavedWorkflow = {
          workflow_id: `workflow_${Date.now()}`,
          title: handoffSpec.name || 'New Workflow from Console',
          status: 'draft',
          source: 'n8n',
          company_name: '',
          trigger: handoffSpec.steps[0]?.actionId || '',
          steps: [],
          integrations: [],
          estimated_time: '0',
          automation_percentage: '0',
          error_handling: '',
          notes: handoffSpec.description || '',
          created_at: new Date().toISOString(),
        }

        // Save to localStorage and select it (causes canvas to render)
        saveWorkflow(newWorkflow)
        setLocalWorkflows([newWorkflow, ...wfs])
        setSelectedId(newWorkflow.workflow_id)

        // Store converted nodes/edges for injection once canvas mounts
        pendingHandoffRef.current = { nodes: rfNodes, edges: rfEdges }

        // Clear handoff storage and URL param
        clearWorkflowSpec()
        window.history.replaceState({}, '', '/workflows')
        return
      }
    }
    
    // Check for generate query param
    const generateParam = searchParams?.get('generate')
    if (generateParam) {
      setGenerationPrompt(decodeURIComponent(generateParam))
      setShowGenerationModal(true)
      // Remove generate param from URL
      const url = new URL(window.location.href)
      url.searchParams.delete('generate')
      window.history.replaceState({}, '', url.toString())
    }
    
    const sel = searchParams?.get('selected')
    if (sel) {
      setSelectedId(sel)
    } else if (wfs.length > 0) {
      setSelectedId(wfs[0].workflow_id)
    }
  }, [])

  // Apply a marketplace template to a brand-new workflow canvas
  // (?applyTemplate=<id>, set by the "Try it" button on /templates/[id]).
  useEffect(() => {
    const templateId = searchParams?.get('applyTemplate')
    if (!templateId) return

    const url = new URL(window.location.href)
    url.searchParams.delete('applyTemplate')
    window.history.replaceState({}, '', url.toString())

    ;(async () => {
      const template = await fetchTemplateById(templateId)
      if (!template) {
        showToast('Template not found', 'error')
        return
      }
      const { nodes, edges } = templateToCanvas(template)
      await handleGenerationApply(nodes, edges)
    })()
  }, [])

  // Auto-select first API workflow once loaded (if nothing selected yet)
  useEffect(() => {
    if (!selectedId && apiWorkflows.length > 0) {
      setSelectedId(apiWorkflows[0].id)
    }
  }, [apiWorkflows, selectedId])

  // Re-sync localStorage whenever Blueprint page saves a new workflow
  useEffect(() => {
    const sync = () => {
      const wfs = loadWorkflows()
      setLocalWorkflows(wfs)
      const sel = searchParams?.get('selected')
      if (sel) setSelectedId(sel)
    }
    window.addEventListener('aivory_workflows_updated', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('aivory_workflows_updated', sync)
      window.removeEventListener('storage', sync)
    }
  }, [searchParams])

  // Close "More" dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setShowMore(false)
      if (activateRef.current && !activateRef.current.contains(e.target as Node)) setShowActivateDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSaveStep = async (updated: SavedWorkflow) => {
    if (selected) setUndoStack(prev => [...prev.slice(-9), selected])
    // If this is an API-backed workflow, patch via API
    if (apiWorkflows.find(aw => aw.id === updated.workflow_id)) {
      try {
        await patchWorkflow(updated.workflow_id, savedToSpec(updated))
        await refreshWorkflows()
      } catch (err) {
        console.error('[handleSaveStep]', err)
      }
    } else {
      updateWorkflow(updated.workflow_id, updated)
      setLocalWorkflows(loadWorkflows())
    }
    setEditTarget(null)
    setRightPanelOpen(false)
  }

  const handleStatusChange = async (status: SavedWorkflow['status']) => {
    if (!selected) return
    if (apiWorkflows.find(aw => aw.id === selected.workflow_id)) {
      try {
        await patchWorkflow(selected.workflow_id, { status })
        await refreshWorkflows()
      } catch (err) { console.error('[handleStatusChange]', err) }
    } else {
      updateWorkflow(selected.workflow_id, { status })
      setLocalWorkflows(loadWorkflows())
    }
  }

  const handleTitleSave = async (newTitle: string) => {
    if (!selected || !newTitle.trim()) return
    if (apiWorkflows.find(aw => aw.id === selected.workflow_id)) {
      try {
        await patchWorkflow(selected.workflow_id, { title: newTitle.trim() })
        await refreshWorkflows()
      } catch (err) { console.error('[handleTitleSave]', err) }
    } else {
      updateWorkflow(selected.workflow_id, { title: newTitle.trim() })
      setLocalWorkflows(loadWorkflows())
    }
    setEditingTitle(false)
  }

  const handleDelete = async (id: string) => {
    if (apiWorkflows.find(aw => aw.id === id)) {
      try {
        await removeWorkflow(id)
        await refreshWorkflows()
      } catch (err) { console.error('[handleDelete]', err) }
    } else {
      deleteWorkflow(id)
      setLocalWorkflows(loadWorkflows())
    }
    clearCanvasState(id)
    const remaining = [...apiWorkflows.map(specToSaved), ...localWorkflows].filter(w => w.workflow_id !== id)
    if (selectedId === id) setSelectedId(remaining[0]?.workflow_id ?? null)
    setShowMore(false)
  }

  const handleExport = () => {
    if (!selected) return
    
    // Convert Aivory workflow to n8n format for import into n8n
    const n8nWorkflow = convertToN8nWorkflow({
      workflow_id: selected.workflow_id,
      title: selected.title,
      trigger: selected.trigger,
      steps: selected.steps.map((s, i) => ({
        step: i + 1,
        action: s.action,
        tool: s.tool,
        output: s.output,
      })),
      company_name: selected.company_name,
    })
    
    const blob = new Blob([JSON.stringify(n8nWorkflow, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selected.title.replace(/\s+/g, '-').toLowerCase()}-n8n.json`
    a.click()
    URL.revokeObjectURL(url)
    setShowMore(false)
  }

  const handleUndo = async () => {
    if (canvasCanUndo && undoCanvasRef.current) {
      undoCanvasRef.current()
      return
    }

    if (!undoStack.length || !selected) return
    const prev = undoStack[undoStack.length - 1]
    setUndoStack(s => s.slice(0, -1))
    if (apiWorkflows.find(aw => aw.id === selected.workflow_id)) {
      try {
        await patchWorkflow(selected.workflow_id, savedToSpec(prev))
        await refreshWorkflows()
      } catch (err) { console.error('[handleUndo]', err) }
    } else {
      updateWorkflow(selected.workflow_id, prev)
      setLocalWorkflows(loadWorkflows())
    }
  }

  const handleSaveVersion = async (versionName: string) => {
    if (!selected) return
    // Always create a new API workflow as a snapshot copy
    try {
      const snapshot = await createWorkflow({
        ...savedToSpec(selected),
        title: `${selected.title} (${versionName})`,
        status: 'draft',
      })
      await refreshWorkflows()
      setSelectedId(snapshot.id)
    } catch (err) {
      console.error('[handleSaveVersion]', err)
      // Fallback: save to localStorage
      const snap: SavedWorkflow = {
        ...selected,
        workflow_id: `${selected.workflow_id}-${versionName.replace(/\s+/g, '-').toLowerCase()}`,
        title: `${selected.title} (${versionName})`,
        created_at: new Date().toISOString(),
      }
      const existing = loadWorkflows()
      if (!existing.find(w => w.workflow_id === snap.workflow_id)) {
        localStorage.setItem('aivory_workflows', JSON.stringify([...existing, snap]))
        setLocalWorkflows(loadWorkflows())
      }
    }
    setShowSaveModal(false)
  }

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const handleActivate = async () => {
    if (!selected || activating) return
    setActivationModalOpen(true)
  }

  const handleActivationSubmit = async (credentials: N8nCredentials) => {
    if (!selected) return
    setActivationLoading(true)
    setActivating(true)
    try {
      // Persist credentials to chosen storage
      saveCredentials(credentials)

      // Build the n8n workflow JSON from the current canvas so the deployed
      // workflow carries the node configs (inspector / setup copilot edits).
      // Without this, the activate route falls back to a bare placeholder.
      const canvas = loadCanvasState(selected.workflow_id)
      const workflow_json = canvas && canvas.nodes.length > 0
        ? {
            ...reactFlowToN8n(canvas.nodes as any, canvas.edges as any, {
              name: selected.title, nodes: [], connections: {}, settings: {},
            } as any),
            name: selected.title,
          }
        : undefined

      // POST to activate route with user-provided n8n credentials
      // (asset() prefixes the /dashboard basePath — Next serves API routes there)
      const res = await fetch(asset('/api/workflows/activate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: selected.workflow_id,
          workflow_data: { ...selected, ...(workflow_json ? { workflow_json } : {}) },
          n8n_instance_url: credentials.instanceUrl,
          n8n_api_key: credentials.apiKey,
        }),
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        // Map error codes to user-friendly toast messages
        if (res.status === 400) {
          showToast(t('activationModal.errorMissingCreds'), 'error')
        } else if (res.status === 401) {
          showToast(t('activationModal.errorInvalidCreds'), 'error')
        } else if (res.status === 502) {
          if (data.code === 'INSTANCE_UNREACHABLE') {
            showToast(t('activationModal.errorUnreachable'), 'error')
          } else {
            showToast(t('activationModal.errorDeployFailed'), 'error')
          }
        } else {
          showToast(data.error || t('activationModal.errorDeployFailed'), 'error')
        }
        return
      }

      // Success — update workflow state
      if (apiWorkflows.find(aw => aw.id === selected.workflow_id)) {
        await refreshWorkflows()
      } else {
        updateWorkflow(selected.workflow_id, {
          status: 'active',
          n8n_workflow_id: data.n8n_workflow_id,
          n8n_url: data.n8n_url,
          n8nWebhookPath: data.n8nWebhookUrl || null,
        })
        setLocalWorkflows(loadWorkflows())
      }

      // Open n8n workflow in new tab
      if (data.n8n_url) {
        window.open(data.n8n_url, '_blank')
      }

      setActivationModalOpen(false)
      showToast('Workflow deployed to n8n', 'success')
    } catch (err) {
      showToast(t('activationModal.errorNetwork'), 'error')
      console.error('[activate]', err)
    } finally {
      setActivationLoading(false)
      setActivating(false)
    }
  }

  const handleDeactivate = async () => {
    if (!selected || activating) return
    setActivating(true)
    try {
      if (apiWorkflows.find(aw => aw.id === selected.workflow_id)) {
        await deactivateWorkflow(selected.workflow_id)
        await refreshWorkflows()
        showToast('Workflow deactivated', 'success')
      } else {
        updateWorkflow(selected.workflow_id, { status: 'draft' })
        setLocalWorkflows(loadWorkflows())
        showToast('Workflow deactivated', 'success')
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to deactivate workflow.', 'error')
      console.error('[deactivate]', err)
    } finally {
      setActivating(false)
    }
  }

  // ── Copilot apply suggestion ────────────────────────────
  // ALWAYS creates a NEW workflow — never appends to existing canvas
  const handleCopilotApply = async (workflow: import('@/lib/workflows/copilotClient').GeneratedWorkflow) => {
    // Build React Flow nodes + edges from the generated workflow.
    // Map nodeMapper intents to canvas icon/category
    const intentToIcon: Record<string, string> = {
      email: 'mail', messaging: 'slack', http: 'http', respond: 'respond',
      filter: 'branch', transform: 'set', schedule: 'schedule', ai: 'http',
    }
    const intentToCategory: Record<string, string> = {
      email: 'channel', messaging: 'channel', http: 'action', respond: 'channel',
      filter: 'condition', transform: 'action', schedule: 'trigger', ai: 'action',
    }
    // step.app ("gmail", "slack", "openai", …) is the definitive signal for
    // brand icons and category colors — step.type/intent guessing is only the
    // fallback. Without it every node collapsed to generic icons and two
    // body colors.
    const AI_APPS = new Set(['openai', 'anthropic', 'claude', 'ai', 'llm', 'gemini'])
    const DB_APPS = new Set(['postgres', 'postgresql', 'mysql', 'mongodb', 'redis', 'airtable', 'google sheets', 'notion', 'supabase'])
    const categoryForStep = (app: string, type: string, intent: string): string => {
      if (type === 'trigger') return 'trigger'
      if (type === 'condition') return 'condition'
      if (AI_APPS.has(app)) return 'ai'
      if (DB_APPS.has(app)) return 'database'
      if (type === 'channel') return 'channel'
      return intentToCategory[intent] ?? 'action'
    }
    const allSteps = workflow.steps.map((step, index) => ({
      step: index + 1,
      action: step.title,
      tool: step.type,
      output: step.description || '',
      type: step.type,
      app: (step.app || '').toLowerCase().trim(),
      config: step.config || {},
    }))
    const rfNodes = allSteps.map((s, i) => {
      const intent = detectNodeIntent(s.action || '', s.tool || '')
      return {
        id: `copilot-${Date.now()}-${i}`,
        type: 'standardNode' as const,
        position: { x: 400, y: 100 + i * 180 },
        data: {
          label: s.action || `Step ${i + 1}`,
          icon: i === 0 ? 'webhook' : (intentToIcon[intent] ?? 'http'),
          category: i === 0 ? 'trigger' : categoryForStep(s.app, s.type, intent),
          app: s.app || undefined,
          title: s.action || `Step ${i + 1}`,
          description: s.output || s.tool || '',
          config: s.config || {},
        },
      }
    })
    const rfEdges = allSteps.slice(0, -1).map((_, i) => ({
      id: `copilot-e-${Date.now()}-${i}`,
      source: rfNodes[i].id,
      target: rfNodes[i + 1].id,
      type: 'smoothstep' as const,
      animated: false,
    }))

    console.log('[Aivory Copilot] Creating NEW workflow → nodes:', rfNodes.length, 'edges:', rfEdges.length)

    // Generate a meaningful title from the suggestion trigger text
    const title = workflow.workflowName || allSteps[0]?.action || `Aivory Workflow ${new Date().toLocaleTimeString()}`

    const newWorkflow: SavedWorkflow = {
      workflow_id: `workflow_${Date.now()}`,
      title: `${title} (AI)`,
      status: 'draft',
      source: 'n8n',
      company_name: '',
      trigger: allSteps[0]?.action || '',
      steps: allSteps.slice(1).map((step) => ({
        step: step.step,
        action: step.action,
        tool: step.tool,
        output: step.output,
        type: step.type,
        config: step.config,
      })),
      integrations: [],
      estimated_time: workflow.estimate_hours ? `~${workflow.estimate_hours}h estimated` : '0',
      // automation_score arrives on a 0–1 OR 0–10 scale depending on the
      // model's mood — normalize so 8 renders as 80%, not 800%.
      automation_percentage: workflow.automation_score
        ? `${Math.min(100, Math.round(workflow.automation_score <= 1 ? workflow.automation_score * 100 : workflow.automation_score * 10))}% automated`
        : '0',
      error_handling: '',
      notes: workflow.summary || '',
      created_at: new Date().toISOString(),
    }

    let workflowId = newWorkflow.workflow_id
    try {
      const created = await createWorkflow(savedToSpec(newWorkflow))
      await refreshWorkflows()
      workflowId = created.id
      setSelectedId(created.id)
    } catch {
      saveWorkflow(newWorkflow)
      setLocalWorkflows(loadWorkflows())
      setSelectedId(newWorkflow.workflow_id)
    }

    // Store pending nodes for injection once the NEW canvas mounts
    pendingHandoffRef.current = { nodes: rfNodes, edges: rfEdges }
    // Persist to backend canvas for the new workflow
    fetch(`/api/workflows/${workflowId}/canvas`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes: rfNodes, edges: rfEdges }),
    }).catch(() => {})

    showToast('New workflow created from Aivory suggestion', 'success')
  }

  // ── Generation apply handler ─────────────────────────────
  // ALWAYS creates a NEW workflow — never appends to existing canvas
  const handleGenerationApply = async (nodes: any[], edges: any[]) => {
    console.log('[Generation] Creating NEW workflow → nodes:', nodes.length, 'edges:', edges.length)

    // Convert nodes to steps format for the workflow record
    const newSteps: SavedWorkflow['steps'] = nodes.map((node, i) => ({
      step: i + 1,
      action: node.data?.label || node.data?.title || `Step ${i + 1}`,
      tool: node.data?.appId || '',
      output: node.data?.actionId || '',
      connectionId: node.data?.connectionId,
      appId: node.data?.appId,
      config: node.data?.inputs || {},
    }))

    // Generate a meaningful title from the first node
    const firstNode = nodes[0]
    const title = firstNode?.data?.title || firstNode?.data?.label || `Generated Workflow ${new Date().toLocaleTimeString()}`

    const newWorkflow: SavedWorkflow = {
      workflow_id: `workflow_${Date.now()}`,
      title: `${title} (AI)`,
      status: 'draft',
      source: 'n8n',
      company_name: '',
      trigger: firstNode?.data?.title || '',
      steps: newSteps,
      integrations: [],
      estimated_time: '0',
      automation_percentage: '0',
      error_handling: '',
      notes: '',
      created_at: new Date().toISOString(),
    }

    let workflowId = newWorkflow.workflow_id
    try {
      const created = await createWorkflow(savedToSpec(newWorkflow))
      await refreshWorkflows()
      workflowId = created.id
      setSelectedId(created.id)
    } catch {
      saveWorkflow(newWorkflow)
      setLocalWorkflows(loadWorkflows())
      setSelectedId(newWorkflow.workflow_id)
    }

    // Store pending nodes for injection once the NEW canvas mounts
    pendingHandoffRef.current = { nodes, edges }
    // Persist to backend canvas for the new workflow
    fetch(`/api/workflows/${workflowId}/canvas`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes, edges }),
    }).catch(() => {})

    showToast('New workflow generated', 'success')
    setShowGenerationModal(false)
  }
  // ── Open Workflow Builder (Blank) ────────────────────────
  const handleOpenWorkflowBuilder = async () => {
    const newWorkflow: SavedWorkflow = {
      workflow_id: `workflow_${Date.now()}`,
      title: `Blank Workflow`,
      status: 'draft',
      source: 'n8n',
      company_name: '',
      trigger: '',
      steps: [],
      integrations: [],
      estimated_time: '0',
      automation_percentage: '0',
      error_handling: '',
      notes: '',
      created_at: new Date().toISOString(),
    }
    
    let workflowId = newWorkflow.workflow_id
    try {
      const created = await createWorkflow(savedToSpec(newWorkflow))
      await refreshWorkflows()
      workflowId = created.id
      setSelectedId(created.id)
    } catch {
      saveWorkflow(newWorkflow)
      setLocalWorkflows(loadWorkflows())
      setSelectedId(newWorkflow.workflow_id)
    }
  }

  // ── Empty state ──────────────────────────────────────────
  if (workflows.length === 0) {
    return (
      <div className={styles.onboardingOverlay}>
        <div className={styles.onboardingContent}>
          <div className={styles.onboardingAvatarWrap}>
            <img src={asset("/Aivory_Avatar.svg")} alt="Aivory" width={28} height={28} />
          </div>
          <h2 className={styles.onboardingTitle}>{t('onboardingTitle')}</h2>
          <p className={styles.onboardingSubtitle}>
            {t('onboardingSubtitle')}
          </p>
          <button
            className={styles.onboardingCTA}
            onClick={() => {}}
          >
            <img src={asset("/Aivory_Avatar.svg")} alt="" width={16} height={16} aria-hidden="true" />
            {t('askAivoryCopilot')}
          </button>
          <p className={styles.onboardingHotkey}>
            Press <kbd>/</kbd> or <kbd>⌘K</kbd> anytime to open Aivory Copilot
          </p>
          <p className={styles.onboardingSecondary}>
            {t('alreadyHaveBlueprint')}{' '}
            <button className={styles.onboardingSecondaryLink} onClick={() => router.push('/blueprint')}>
              {t('goToBlueprint')}
            </button>
          </p>
          <button 
            className={styles.onboardingWorkflowBuilderBtn}
            onClick={handleOpenWorkflowBuilder}
          >
            Open Workflow Builder
          </button>
        </div>

        {/* Copilot panel renders over the overlay */}
        <CopilotTogglePanel
          currentSpec={null}
          onApplySuggestion={handleCopilotApply}
        />
      </div>
    )
  }

  return (
    <div className={`${styles.workflowsLayout} font-manrope`}>
      {routingNotice !== null && (
        <ContinuedFromConsole summary={routingNotice} onDismiss={() => setRoutingNotice(null)} />
      )}

      {/* ── Left sidebar ── */}
      <aside className={`${styles.workflowList} ${isWorkflowListCollapsed ? styles.workflowListCollapsed : ''}`}>
        {isWorkflowListCollapsed ? (
          /* ── Icon strip (collapsed) ── */
          <div className={styles.sidebarIconStrip}>
            {/* Toggle / expand */}
            <button
              className={styles.workflowListCollapseBtn}
              onClick={() => setIsWorkflowListCollapsed(false)}
              aria-label="Expand workflow list"
              aria-expanded={false}
              style={{ marginBottom: 4 }}
            >
              ›
            </button>
            {/* Workflows icon with badge */}
            <button
              className={`${styles.sidebarIconBtn} ${styles.sidebarIconBtnActive}`}
              onClick={() => setIsWorkflowListCollapsed(false)}
              title={`Workflows (${workflows.length})`}
              aria-label={`Workflows (${workflows.length})`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/>
                <path d="M9 6h3a3 3 0 0 1 3 3v6"/><path d="M18 15V9"/>
              </svg>
              {workflows.length > 0 && (
                <span className={styles.sidebarIconBadge}>{workflows.length}</span>
              )}
            </button>
            {/* Apps icon with badge */}
            <button
              className={styles.sidebarIconBtn}
              onClick={() => setIsWorkflowListCollapsed(false)}
              title="Apps"
              aria-label={`Apps (${apps.length})`}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="1" width="6" height="6" rx="1"/>
                <rect x="9" y="1" width="6" height="6" rx="1"/>
                <rect x="1" y="9" width="6" height="6" rx="1"/>
                <rect x="9" y="9" width="6" height="6" rx="1"/>
              </svg>
              {apps.length > 0 && (
                <span className={styles.sidebarIconBadge}>{apps.length}</span>
              )}
            </button>
            <div className={styles.sidebarIconDivider} />
            {/* Nav icons */}
            <a className={styles.sidebarIconBtn} href="/console" title="Console" aria-label="Console">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
              </svg>
            </a>
            <a className={styles.sidebarIconBtn} href="/dashboard" title="Dashboard" aria-label="Dashboard">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
            </a>
            <a className={styles.sidebarIconBtn} href="/diagnostics" title="Diagnostics" aria-label="Diagnostics">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </a>
            <a className={styles.sidebarIconBtn} href="/blueprint" title="Blueprint" aria-label="Blueprint">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </a>
            <a className={styles.sidebarIconBtn} href="/roadmap" title="Roadmap" aria-label="Roadmap">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/>
                <line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            </a>
          </div>
        ) : (
          /* ── Expanded sidebar ── */
          <>
            <div className={styles.workflowListHeader}>
              <span className={styles.workflowListTitle}>{t('title')}</span>
              <span className={styles.workflowListCount}>{workflows.length}</span>
              <button
                className={styles.workflowListCollapseBtn}
                onClick={() => setIsWorkflowListCollapsed(true)}
                aria-label="Collapse workflow list"
                aria-expanded={true}
              >
                ‹
              </button>
            </div>
            {workflows.map(wf => (
              <div
                key={wf.workflow_id}
                className={`${styles.workflowListItem} ${selectedId === wf.workflow_id ? styles.workflowListItemActive : ''}`}
                onClick={() => { setSelectedId(wf.workflow_id); setEditTarget(null) }}
              >
                <div className={styles.wliTop}>
                  <span className={styles.wliTitle}>{wf.title}</span>
                  <div className={styles.wliBadges}>
                    <ModeBadge wf={wf} />
                    <button
                      className={styles.deleteBtn}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Delete workflow "${wf.title}"? This cannot be undone.`)) {
                          handleDelete(wf.workflow_id)
                        }
                      }}
                      title="Delete workflow"
                      aria-label="Delete workflow"
                    >
                      {Icons.trash}
                    </button>
                  </div>
                </div>
                <span className={styles.wliMeta}>{wf.company_name} · {new Date(wf.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </>
        )}

        {/* ── Apps Section ── */}
        {!isWorkflowListCollapsed && (
          <div className={styles.appsSection}>
            <div className={styles.appsSectionHeader}>
              <span className={styles.appsSectionTitle}>{t('apps')}</span>
            </div>
            <div className={styles.appsSearchWrap}>
              <input
                className={styles.appsSearch}
                placeholder={t('searchApps')}
                value={appsSearch}
                onChange={e => setAppsSearch(e.target.value)}
              />
            </div>
            <div className={styles.appsCategoryPills}>
              {appCategories.map(cat => (
                <button
                  key={cat}
                  className={`${styles.appsCategoryPill} ${appsCategory === cat ? styles.appsCategoryPillActive : ''}`}
                  onClick={() => setAppsCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className={styles.appsListWrap}>
              {filteredApps.map(app => (
                <div
                  key={app.id}
                  className={styles.appItem}
                  draggable
                  onDragStart={e => handleAppDragStart(e, app)}
                  title={`Drag ${app.name} to canvas`}
                >
                  {app.iconPath ? (
                    <img src={asset(app.iconPath)} alt="" className={styles.appItemIcon} data-brand={app.id.toLowerCase()} />
                  ) : (
                    <span className={styles.appItemIcon}>{app.icon}</span>
                  )}
                  <span className={styles.appItemName}>{app.name}</span>
                </div>
              ))}
              {filteredApps.length === 0 && (
                <p className={styles.appsEmpty}>{t('noAppsFound')}</p>
              )}
            </div>

            {/* Standard Nodes palette — drag to canvas */}
            <DynamicNodePalette />
          </div>
        )}
      </aside>

      {/* ── Main canvas ── */}
      {selected && (
        <div className={styles.canvasArea}>

          {/* Toolbar */}
          <div className={styles.canvasHeader}>
            <div className={styles.canvasHeaderLeft}>
              {editingTitle ? (
                <input
                  className={styles.titleInput}
                  defaultValue={selected.title}
                  autoFocus
                  onBlur={e => handleTitleSave(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleTitleSave((e.target as HTMLInputElement).value)
                    if (e.key === 'Escape') setEditingTitle(false)
                  }}
                />
              ) : (
                <h1 className={styles.canvasTitle} onClick={() => setEditingTitle(true)} title="Click to edit">
                  {selected.title}
                  <span className={styles.editTitleHint}>{Icons.edit}</span>
                </h1>
              )}
              {/* Preview Mode label */}
              {!isActiveWorkflow(selected) && (
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: 5,
                  background: 'rgba(255,255,255,0.04)',
                  color: '#a8a6a2',
                  border: '1px solid rgba(255,255,255,0.07)',
                  letterSpacing: '0.3px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}>
                  {t('previewMode')}
                </span>
              )}
            </div>

            <div className={styles.canvasHeaderActions}>
              <select
                className={styles.statusSelect}
                value={selected.status}
                onChange={e => handleStatusChange(e.target.value as SavedWorkflow['status'])}
                aria-label="Change status"
              >
                <option value="draft">{t('draft')}</option>
                <option value="active">{t('active')}</option>
                <option value="archived">{t('archived')}</option>
              </select>

              {/* Save Workflow */}
              <button className={`${styles.saveBtn} btn-style-a`} onClick={() => setShowSaveModal(true)}>
                {Icons.save}
                {t('save')}
              </button>

              {/* Generate workflow */}
              <button
                className={`${styles.generateBtn} btn-style-b`}
                onClick={() => setShowGenerationModal(true)}
                title={t('generateFromNL')}
              >
                {t('generate')}
              </button>

              {/* Undo */}
              <button
                className={`${styles.undoBtn} btn-style-a`}
                onClick={handleUndo}
                disabled={!undoStack.length && !canvasCanUndo}
                title={t('undoLastChange')}
                style={(!undoStack.length && !canvasCanUndo) ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
              >
                {Icons.undo}
                {t('undo')}
              </button>

              {/* More dropdown */}
              <div className={styles.moreDropdownWrap} ref={moreRef}>
                <button
                  className={styles.iconBtn}
                  onClick={() => setShowMore(v => !v)}
                  aria-label="More options"
                >
                  {Icons.moreH}
                </button>
                {showMore && (
                  <div className={styles.moreDropdown}>
                    <button className={styles.moreDropdownItem} onClick={handleExport}>
                      {Icons.download} {t('exportJson')}
                    </button>
                    <button
                      className={`${styles.moreDropdownItem} ${styles.moreDropdownItemDanger}`}
                      onClick={() => handleDelete(selected.workflow_id)}
                    >
                      {Icons.trash} {t('deleteWorkflow')}
                    </button>
                  </div>
                )}
              </div>

              {/* Activate/Deactivate dropdown */}
              <div className={styles.activateDropdownWrap} ref={activateRef}>
                {isActiveWorkflow(selected) ? (
                  // Active workflow — show deactivate button
                  <>
                    <button
                      className={`${styles.activateDropdownBtn} btn-style-b`}
                      onClick={() => setShowActivateDropdown(v => !v)}
                      disabled={activating}
                      aria-label="Workflow options"
                    >
                      {Icons.play}
                      {activating ? t('processing') : t('deactivate')}
                    </button>
                    {showActivateDropdown && (
                      <div className={styles.activateDropdownMenu}>
                        <button
                          className={styles.activateDropdownItem}
                          onClick={() => { handleDeactivate(); setShowActivateDropdown(false) }}
                        >
                          {Icons.stop}
                          {t('deactivateWorkflow')}
                        </button>
                        {selected.n8n_url && (
                          <a
                            className={styles.activateDropdownItem}
                            href={selected.n8n_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setShowActivateDropdown(false)}
                          >
                            {Icons.play}
                            {t('viewInN8n')}
                          </a>
                        )}
                      </div>
                    )}
                    {selected.n8nWebhookPath && (
                      <div style={{ fontSize: '0.75rem', opacity: 0.8, cursor: 'text', userSelect: 'all', marginTop: 4, wordBreak: 'break-all' }}>
                        Webhook: {selected.n8nWebhookPath}
                      </div>
                    )}
                  </>
                ) : (
                  // Preview workflow — Activate button
                  <button
                    className={`${styles.activateDropdownBtn} btn-style-a`}
                    onClick={handleActivate}
                    disabled={activating}
                    title={t('deployToN8n')}
                  >
                    {Icons.play}
                    {activating ? t('activating') : t('activate')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Toast notification */}
          {toast && (
            <div className={styles.activateToast} data-type={toast.type}>
              {toast.msg}
            </div>
          )}

          {/* Canvas flow — fills remaining space */}
          <div className={styles.canvasBody}>
            {/* ── Aivory Copilot — toggle panel ── */}
            <CopilotTogglePanel
              currentSpec={selected ? selected : null}
              currentWorkflowName={selected?.title}
              onApplySuggestion={handleCopilotApply}
            />
            <N8nWorkflowCanvas
              key={`${selected.workflow_id}-${selected.n8n_workflow_id ?? 'preview'}`}
              workflowId={selected.workflow_id}
              isActive={isActiveWorkflow(selected)}
              n8nWorkflowId={selected.n8n_workflow_id}
              fallbackSteps={selected.steps}
              onInjectNodes={(fn) => {
                canvasInjectRef.current = fn
                // If there are pending handoff nodes, inject them now
                if (pendingHandoffRef.current) {
                  const { nodes: pNodes, edges: pEdges } = pendingHandoffRef.current
                  pendingHandoffRef.current = null
                  fn(pNodes, pEdges)
                }
              }}
              onHistoryChange={setCanvasCanUndo}
              registerUndo={(fn) => { undoCanvasRef.current = fn }}
            />

            {/* Meta footer — absolutely positioned overlay */}
            <div className={styles.canvasMeta}>
              {selected.integrations.length > 0 && (
                <div className={styles.canvasIntegrations}>
                  <span className={styles.canvasMetaLabel}>{t('integrations')}</span>
                  {selected.integrations.slice(0, 2).map((int, i) => (
                    <span key={i} className={styles.integrationTag}>{int}</span>
                  ))}
                  {selected.integrations.length > 2 && (
                    <span className={styles.integrationTag}>+{selected.integrations.length - 2}</span>
                  )}
                </div>
              )}
              <div className={styles.canvasStats}>
                {selected.estimated_time && (
                  <span className={styles.canvasStat}>
                    <span className={styles.canvasStatIcon}>{Icons.clock}</span>
                    {selected.estimated_time.replace(/minutes per client/g, 'min/client').replace(/minutes/g, 'min')}
                  </span>
                )}
                {selected.automation_percentage && (
                  <span className={styles.canvasStat}>
                    <span className={styles.canvasStatIcon}>{Icons.robot}</span>
                    {selected.automation_percentage.replace(/automated/g, 'auto')}
                  </span>
                )}
              </div>
            </div>

            {/* Secondary undo — absolutely positioned overlay */}
            <button
              className={styles.canvasUndoBtn}
              onClick={handleUndo}
              aria-disabled={!undoStack.length && !canvasCanUndo}
              title={(undoStack.length || canvasCanUndo) ? t('undoLastChange') : t('nothingToUndo')}
            >
              {Icons.undo}
              {t('undoLastChange')}
            </button>
          </div>


        </div>
      )}

      {/* ── Right edge indicator — shown when step selected but panel closed ── */}
      {selected && editTarget && !rightPanelOpen && (
        <button
          className={styles.rightEdgeIndicator}
          onClick={() => setRightPanelOpen(true)}
          title="Edit step details"
          aria-label="Open step editor"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      )}

      {/* ── Right panel ── */}
      {selected && editTarget && rightPanelOpen && (
        <RightPanel
          workflow={selected}
          editTarget={editTarget}
          onSave={handleSaveStep}
          onClose={() => { setEditTarget(null); setRightPanelOpen(false) }}
        />
      )}

      {/* ── Save Workflow modal ── */}
      {showSaveModal && (
        <SaveWorkflowModal
          onClose={() => setShowSaveModal(false)}
          onSave={handleSaveVersion}
        />
      )}

      {/* ── Workflow Generation modal ── */}
      <WorkflowGenerationModal
        isOpen={showGenerationModal}
        onClose={() => setShowGenerationModal(false)}
        onApply={handleGenerationApply}
        availableApps={apps}
        initialPrompt={generationPrompt || undefined}
      />

      {/* ── Activation Modal ── */}
      <ActivationModal
        open={activationModalOpen}
        onClose={() => setActivationModalOpen(false)}
        onSubmit={handleActivationSubmit}
        loading={activationLoading}
      />
    </div>
  )
}

export default function WorkflowsPage() {
  return (
    <Suspense fallback={<div style={{ background: '#2c2c2c', height: '100vh' }} />}>
      <WorkflowsPageInner />
    </Suspense>
  )
}
