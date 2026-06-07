'use client';

import { useEffect, useState } from 'react';
import type { WorkflowNodeData } from '@/types/workflow-node';

type Props = {
  selectedNodeId: string | null;
  nodeData: WorkflowNodeData | null;
  onChange: (next: Partial<WorkflowNodeData>) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

// ── Shared header bar style (matches canvasHeader in workflows.module.css) ──
const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: 52,
  padding: '0 16px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  background: 'rgba(255,255,255,0.025)',
  flexShrink: 0,
  gap: 8,
};

const collapseBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 7,
  color: '#a8a6a2',
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'all 0.15s',
  fontSize: 12,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 7,
  padding: '7px 10px',
  fontSize: 12,
  color: '#e8e6e3',
  outline: 'none',
  resize: 'vertical' as const,
  fontFamily: 'inherit',
  boxSizing: 'border-box' as const,
  transition: 'border-color 0.15s',
};

export function StepInspector({ selectedNodeId, nodeData, onChange, collapsed = false, onToggleCollapse }: Props) {
  const [localTitle, setLocalTitle] = useState('');
  const [localSubtitle, setLocalSubtitle] = useState('');
  const [localDescription, setLocalDescription] = useState('');

  useEffect(() => {
    setLocalTitle(nodeData?.title ?? '');
    setLocalSubtitle(nodeData?.subtitle ?? '');
    setLocalDescription(nodeData?.description ?? '');
  }, [selectedNodeId, nodeData]);

  const categoryLabelMap: Record<string, string> = {
    trigger: 'Trigger',
    action: 'Action',
    ai: 'AI Step',
    condition: 'Condition',
    channel: 'Channel',
    system: 'System',
  };
  const categoryLabel = nodeData ? (categoryLabelMap[nodeData.category] ?? 'Step') : 'Edit Step';

  const handleApply = () => {
    onChange({ title: localTitle, subtitle: localSubtitle, description: localDescription });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'transparent' }}>
      {/* Header — same visual style as canvasHeader */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#5a5a58' }}>
            Edit Step
          </span>
          <span style={{ fontSize: 13, fontWeight: 300, color: '#e8e6e3', fontFamily: "'Inter Tight', sans-serif", letterSpacing: '-0.1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {categoryLabel}
          </span>
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            style={collapseBtn}
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand panel' : 'Collapse panel'}
            aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
          >
            {collapsed ? '›' : '‹'}
          </button>
        )}
      </div>

      {/* Body — only shown when not collapsed */}
      {!collapsed && (
        <>
          {!selectedNodeId || !nodeData ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', fontSize: 12, color: '#5a5a58', textAlign: 'center', lineHeight: 1.6 }}>
              Select a step on the canvas to edit its details.
            </div>
          ) : (
            <>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#5a5a58' }}>What happens</div>
                  <textarea
                    style={{ ...inputStyle, minHeight: 72 }}
                    rows={3}
                    placeholder="Describe what happens in this step."
                    value={localTitle}
                    onChange={(e) => setLocalTitle(e.target.value)}
                    onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(0,229,158,0.4)' }}
                    onBlur={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(255,255,255,0.08)' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#5a5a58' }}>Tool / service</div>
                  <input
                    style={inputStyle}
                    placeholder="e.g. Salesforce REST API"
                    value={localSubtitle}
                    onChange={(e) => setLocalSubtitle(e.target.value)}
                    onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(0,229,158,0.4)' }}
                    onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.08)' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#5a5a58' }}>Output</div>
                  <textarea
                    style={{ ...inputStyle, minHeight: 80 }}
                    rows={3}
                    placeholder="What data or result does this step produce?"
                    value={localDescription}
                    onChange={(e) => setLocalDescription(e.target.value)}
                    onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(0,229,158,0.4)' }}
                    onBlur={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(255,255,255,0.08)' }}
                  />
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={handleApply}
                  style={{ width: '100%', background: 'rgba(0,229,158,0.1)', border: '1px solid rgba(0,229,158,0.3)', borderRadius: 8, padding: '9px 12px', fontSize: 12, fontWeight: 600, color: '#00e59e', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                  onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.background = 'rgba(0,229,158,0.16)' }}
                  onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.background = 'rgba(0,229,158,0.1)' }}
                >
                  Update Step
                </button>
                <p style={{ fontSize: 10, color: '#5a5a58', textAlign: 'center', margin: 0 }}>
                  Click "Save" in the toolbar to persist
                </p>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
