'use client';
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

type Tab = 'configure' | 'advanced' | 'output';
interface Props {
  selectedNode: Node<WorkflowNodeData> | null;
  onChange: (nodeId: string, data: Partial<WorkflowNodeData>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

export default function NodeInspectorPanel({ selectedNode, onChange, onDelete, onClose }: Props) {
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
  const handleConfigChange = useCallback((c: NodeConfig) => onChange(nodeId, { config: c }), [nodeId, onChange]);
  const handleUpdate = useCallback(() => {
    if (!config || !data) return;
    if (Object.keys(validateConfig(config)).length > 0) return;
    onChange(nodeId, { title: editName, label: editName, config });
  }, [config, data, editName, nodeId, onChange]);
  const handleTest = useCallback(async () => {
    if (!config) return;
    setTesting(true);
    try {
      const res = await fetch('/api/workflows/test-step', {
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
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary, #a8a6a2)' }}>Inspector</span>
              <span className={styles.typeBadge}>No selection</span>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close inspector">×</button>
        </div>
        <div className={styles.body} style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ color: 'var(--text-tertiary, #5a5a58)', fontSize: 12, lineHeight: 1.6 }}>
            <p style={{ fontSize: 20, marginBottom: 8, opacity: 0.4 }}></p>
            <p>Select a node to inspect</p>
            <p style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>Double-click a node or use the edit button</p>
          </div>
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
        {activeTab === 'configure' && <ConfigureTab config={config} onChange={handleConfigChange} errors={errors} />}
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
    case 'generic':       return <GenericNodeForm config={config} onChange={onChange} errors={errors} />;
    default:              return <p style={{ color: '#5a5a58', fontSize: 12 }}>No configuration available.</p>;
  }
}

function AdvancedTab({ config }: { config: NodeConfig }) {
  return (
    <details style={{ cursor: 'pointer' }}>
      <summary style={{ fontSize: 11, color: '#5a5a58', marginBottom: 8 }}>Developer view</summary>
      <pre style={{ fontSize: 10, color: '#a8a6a2', background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 6, overflow: 'auto', maxHeight: 300, border: '1px solid rgba(255,255,255,0.04)' }}>
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
        background: testResult.success ? 'rgba(0,229,158,0.1)' : 'rgba(248,113,113,0.1)',
        color: testResult.success ? '#00e59e' : '#f87171',
        border: `1px solid ${testResult.success ? 'rgba(0,229,158,0.2)' : 'rgba(248,113,113,0.2)'}`,
      }}>
        {testResult.success ? 'Success' : 'Failed'}
      </div>
      {testResult.executionTime != null && (
        <span style={{ fontSize: 10, color: '#5a5a58', marginLeft: 8 }}>{testResult.executionTime}ms</span>
      )}
      {testResult.error && <p style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>{testResult.error}</p>}
      {testResult.output != null && (
        <pre style={{ fontSize: 10, color: '#a8a6a2', background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 6, overflow: 'auto', maxHeight: 300, marginTop: 8, border: '1px solid rgba(255,255,255,0.04)' }}>
          {typeof testResult.output === 'string' ? testResult.output : JSON.stringify(testResult.output, null, 2)}
        </pre>
      )}
    </div>
  );
}
