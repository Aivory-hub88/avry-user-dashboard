'use client';
import { authedFetch } from '@/lib/deployAuth'
import React, { useState, useMemo, useCallback } from 'react';
import type { Node } from '@xyflow/react';
import type { WorkflowNodeData, NodeConfig } from '@/types/workflow-node';
import { extractConfigFromNode, validateConfig, getNodeTypeLabel } from './nodeConfigUtils';
import styles from './NodeInspectorPanel.module.css';
import HttpRequestForm from './forms/HttpRequestForm';
import WebhookForm from './forms/WebhookForm';
import ScheduleForm from './forms/ScheduleForm';
import ManualTriggerForm from './forms/ManualTriggerForm';
import AiStepForm from './forms/AiStepForm';
import IfForm from './forms/IfForm';
import EditFieldsForm from './forms/EditFieldsForm';
import HttpResponseForm from './forms/HttpResponseForm';
import AgentForm from './forms/AgentForm';
import GenericNodeForm from './forms/GenericNodeForm';
import RssFeedForm from './forms/RssFeedForm';
import SlackForm from './forms/SlackForm';
import GmailForm from './forms/GmailForm';
import SwitchForm from './forms/SwitchForm';
import CodeForm from './forms/CodeForm';
import ErrorHandlingSection from './ErrorHandlingSection';
import { asset } from '@/lib/asset'
import { summarizeWorkflowReadiness } from '@/lib/workflows/nodeReadiness'

type Tab = 'configure' | 'advanced' | 'output';
interface Props {
  selectedNode: Node<WorkflowNodeData> | null;
  onChange: (nodeId: string, data: Partial<WorkflowNodeData>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
  /** All canvas nodes — drives the "Workflow health" summary when nothing is selected. */
  nodes?: Node<WorkflowNodeData>[];
  /** Select a node on the canvas and show its configuration. */
  onSelectNode?: (nodeId: string) => void;
}

export default function NodeInspectorPanel({ selectedNode, onChange, onDelete, onClose, nodes = [], onSelectNode }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('configure');
  const [testing, setTesting] = useState(false);
  const [editName, setEditName] = useState('');
  const [nameInit, setNameInit] = useState<string | null>(null);
  const data = selectedNode?.data ?? null;
  const nodeId = selectedNode?.id ?? '';
  const config = useMemo<NodeConfig | null>(() => data ? extractConfigFromNode(data) : null, [data]);
  if (data && nodeId !== nameInit) { setEditName(data.title || data.label || ''); setNameInit(nodeId); }
  const errors = useMemo(() => config ? validateConfig(config) : {}, [config]);
  const typeLabel = useMemo(() => data ? getNodeTypeLabel(data) : '', [data]);
  const health = useMemo(() => summarizeWorkflowReadiness(nodes), [nodes]);
  const handleConfigChange = useCallback((c: NodeConfig) => onChange(nodeId, { config: c }), [nodeId, onChange]);
  const handleErrorHandlingChange = useCallback(
    (eh: import('@/types/workflow-node').NodeErrorHandling) => onChange(nodeId, { errorHandling: eh }),
    [nodeId, onChange]
  );
  const handleUpdate = useCallback(() => {
    if (!config || !data) return;
    if (Object.keys(validateConfig(config)).length > 0) return;
    onChange(nodeId, { title: editName, label: editName, config });
  }, [config, data, editName, nodeId, onChange]);
  const handleTest = useCallback(async () => {
    if (!config) return;
    setTesting(true);
    try {
      const res = await authedFetch(asset('/api/workflows/test-step'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, config }),
      });
      onChange(nodeId, { testResult: await res.json() });
      setActiveTab('output');
    } catch (err: any) {
      onChange(nodeId, { testResult: { success: false, error: err?.message ?? 'Test failed' } });
      setActiveTab('output');
    } finally { setTesting(false); }
  }, [config, nodeId, onChange]);

  // ── Empty state: panel open but no node selected ──
  if (!selectedNode || !data || !config) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>□</div>
            <div className={styles.headerInfo}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary, #a8a6a2)' }}>Workflow health</span>
              <span className={styles.typeBadge}>No node selected</span>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close inspector">×</button>
        </div>
        <div className={styles.body}>
          <WorkflowHealth health={health} onSelectNode={onSelectNode} />
        </div>
      </div>
    );
  }

  const iconMap: Record<string, string> = {
    trigger: '', action: '', ai: '', condition: '', channel: '', system: '', app: '',
  };
  const icon = iconMap[data.category] ?? '□';
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>{icon}</div>
          <div className={styles.headerInfo}>
            <input className={styles.nameInput} value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => onChange(nodeId, { title: editName, label: editName })}
              aria-label="Node name" />
            <span className={styles.typeBadge}>{typeLabel}</span>
          </div>
        </div>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close inspector">×</button>
      </div>
      <div className={styles.tabs}>
        {(['configure', 'advanced', 'output'] as Tab[]).map((t) => (
          <button key={t} className={`${styles.tab} ${activeTab === t ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(t)}>
            {t === 'configure' ? 'Configure' : t === 'advanced' ? 'Advanced' : 'Output'}
          </button>
        ))}
      </div>
      <div className={styles.body}>
        {activeTab === 'configure' && (
          <>
            <ConfigureTab config={config} onChange={handleConfigChange} errors={errors} />
            {config.type !== 'manualTrigger' && (
              <ErrorHandlingSection value={data.errorHandling} onChange={handleErrorHandlingChange} />
            )}
          </>
        )}
        {activeTab === 'advanced' && <AdvancedTab config={config} />}
        {activeTab === 'output' && <OutputTab testResult={data.testResult ?? null} />}
      </div>
      <div className={styles.footer}>
        <div className={styles.footerButtons}>
          <button className={styles.updateBtn} onClick={handleUpdate}>Update Step</button>
          <button className={styles.testBtn} onClick={handleTest} disabled={testing}>
            {testing ? 'Testing…' : 'Test this step'}
          </button>
        </div>
        <p className={styles.footerHint}>Save in toolbar to persist changes.</p>
      </div>
    </div>
  );
}

function ConfigureTab({ config, onChange, errors }: { config: NodeConfig; onChange: (c: NodeConfig) => void; errors: Record<string, string> }) {
  switch (config.type) {
    case 'httpRequest':   return <HttpRequestForm config={config} onChange={onChange} errors={errors} />;
    case 'webhook':       return <WebhookForm config={config} onChange={onChange} errors={errors} />;
    case 'schedule':      return <ScheduleForm config={config} onChange={onChange} errors={errors} />;
    case 'manualTrigger': return <ManualTriggerForm />;
    case 'aiStep':        return <AiStepForm config={config} onChange={onChange} errors={errors} />;
    case 'ifCondition':   return <IfForm config={config} onChange={onChange} errors={errors} />;
    case 'editFields':    return <EditFieldsForm config={config} onChange={onChange} errors={errors} />;
    case 'httpResponse':  return <HttpResponseForm config={config} onChange={onChange} errors={errors} />;
    case 'agent':         return <AgentForm config={config} onChange={onChange} errors={errors} />;
    case 'rssFeed':       return <RssFeedForm config={config} onChange={onChange} errors={errors} />;
    case 'slack':         return <SlackForm config={config} onChange={onChange} errors={errors} />;
    case 'gmail':         return <GmailForm config={config} onChange={onChange} errors={errors} />;
    case 'switch':        return <SwitchForm config={config} onChange={onChange} errors={errors} />;
    case 'code':          return <CodeForm config={config} onChange={onChange} errors={errors} />;
    case 'generic':       return <GenericNodeForm config={config} onChange={onChange} errors={errors} />;
    default:              return <p style={{ color: '#5a5a58', fontSize: 12 }}>No configuration available.</p>;
  }
}

function AdvancedTab({ config }: { config: NodeConfig }) {
  return (
    <details style={{ cursor: 'pointer' }}>
      <summary style={{ fontSize: 11, color: '#5a5a58', marginBottom: 8 }}>Developer view</summary>
      <pre style={{ fontSize: 10, color: '#a1a1aa', background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 6, overflow: 'auto', maxHeight: 300, border: '1px solid rgba(255,255,255,0.04)' }}>
        {JSON.stringify(config, null, 2)}
      </pre>
    </details>
  );
}

function OutputTab({ testResult }: { testResult: import('@/types/workflow-node').TestStepResult | null }) {
  if (!testResult) {
    return <p style={{ color: '#5a5a58', fontSize: 12 }}>No test output yet. Click &quot;Test this step&quot; to run.</p>;
  }
  return (
    <div>
      <div style={{
        display: 'inline-block', borderRadius: 5, padding: '2px 8px', fontSize: 10, fontWeight: 600, marginBottom: 8,
        background: testResult.success ? 'rgb(from var(--color-accent-workflow) r g b / 0.1)' : 'rgba(248,113,113,0.1)',
        color: testResult.success ? 'var(--color-accent)' : '#f87171',
        border: `1px solid ${testResult.success ? 'rgb(from var(--color-accent-workflow) r g b / 0.2)' : 'rgba(248,113,113,0.2)'}`,
      }}>
        {testResult.success ? 'Success' : 'Failed'}
      </div>
      {testResult.executionTime != null && (
        <span style={{ fontSize: 10, color: '#5a5a58', marginLeft: 8 }}>{testResult.executionTime}ms</span>
      )}
      {testResult.error && <p style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>{testResult.error}</p>}
      {testResult.output != null && (
        <pre style={{ fontSize: 10, color: '#a1a1aa', background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 6, overflow: 'auto', maxHeight: 300, marginTop: 8, border: '1px solid rgba(255,255,255,0.04)' }}>
          {typeof testResult.output === 'string' ? testResult.output : JSON.stringify(testResult.output, null, 2)}
        </pre>
      )}
    </div>
  );
}

type Health = ReturnType<typeof summarizeWorkflowReadiness>;

const sectionTitle: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#5a5a58', margin: '14px 0 6px' };

function WorkflowHealth({ health, onSelectNode }: { health: Health; onSelectNode?: (id: string) => void }) {
  if (health.total === 0) {
    return <p style={{ color: '#5a5a58', fontSize: 12 }}>This workflow has no nodes yet.</p>;
  }
  const allReady = health.ready === health.total;
  return (
    <div style={{ fontSize: 12, color: 'var(--text-secondary, #a8a6a2)' }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: allReady ? 'var(--color-accent, #4ade80)' : '#fbbf24' }}>
        {health.ready} of {health.total} nodes ready
      </div>
      <p style={{ margin: '4px 0 0', fontSize: 11, color: '#5a5a58' }}>
        {allReady ? 'Every node has its connection and required settings.' : 'Click a node below to finish its setup.'}
      </p>

      {health.trigger && (
        <>
          <div style={sectionTitle}>Trigger</div>
          <div>{health.trigger}</div>
        </>
      )}

      {health.pending.length > 0 && (
        <>
          <div style={sectionTitle}>Needs setup</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {health.pending.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onSelectNode?.(p.id)}
                  style={{ width: '100%', textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary, #e8e6e3)' }}>{p.title}</div>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 11, color: '#f87171' }}>
                    {p.items.map((i) => <li key={i.id}>{i.message}</li>)}
                  </ul>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {health.connections.length > 0 && (
        <>
          <div style={sectionTitle}>Connections to set up</div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {health.connections.map((c) => (
              <li key={c.app}><strong>{c.app}</strong> <span style={{ color: '#5a5a58' }}>— used by {c.nodeTitles.join(', ')}</span></li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
