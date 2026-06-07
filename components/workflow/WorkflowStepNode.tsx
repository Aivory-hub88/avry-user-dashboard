'use client';

import { memo } from 'react';
import { Handle, Position, useReactFlow, useNodeId, type NodeProps } from '@xyflow/react';
import type { WorkflowNodeData } from '@/types/workflow-node';

// ── SVG icons per category ────────────────────────────────
const CategoryIcons: Record<string, React.ReactNode> = {
  trigger: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  action: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
    </svg>
  ),
  ai: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
    </svg>
  ),
  condition: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
      <path d="M6 9v6"/><path d="M9 6h6a3 3 0 0 1 3 3v6"/>
    </svg>
  ),
  channel: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.18 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  ),
  system: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
    </svg>
  ),
  app: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  ),
};

// ── Category config ──────────────────────────────────────
const categoryConfig: Record<string, { label: string; accent: string; labelColor: string }> = {
  trigger:   { label: 'Trigger',    accent: '#00e59e', labelColor: '#00e59e' },
  action:    { label: 'Action',     accent: 'rgba(255,255,255,0.12)', labelColor: '#a8a6a2' },
  ai:        { label: 'AI',         accent: '#00e59e', labelColor: '#00e59e' },
  condition: { label: 'Condition',  accent: 'rgba(251,191,36,0.5)', labelColor: '#fbbf24' },
  channel:   { label: 'Channel',    accent: 'rgba(255,255,255,0.12)', labelColor: '#a8a6a2' },
  system:    { label: 'System',     accent: 'rgba(255,255,255,0.12)', labelColor: '#a8a6a2' },
  app:       { label: 'App',        accent: '#818cf8', labelColor: '#818cf8' },
};

const handleStyle: React.CSSProperties = {
  background: '#00e59e',
  width: 8,
  height: 8,
  border: '2px solid #353531',
};

function WorkflowStepNodeBase({ data, selected }: NodeProps & { data: WorkflowNodeData }) {
  const { setNodes, setEdges } = useReactFlow();
  const nodeId = useNodeId();
  const cat = data.category || 'action';
  const cfg = categoryConfig[cat] ?? categoryConfig.action;
  const hasMultiOut = (data.outputs?.length ?? 0) > 1;
  const iconEl = CategoryIcons[cat] ?? CategoryIcons.action;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!nodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  };

  return (
    <div
      className="workflow-node"
      data-selected={selected ? 'true' : undefined}
      data-category={cat}
      style={{ position: 'relative' }}
    >
      {/* Input handle — left */}
      <Handle type="target" position={Position.Left} id="in-main" style={{ ...handleStyle, left: -5, top: '50%', transform: 'translateY(-50%)' }} />

      {/* Top bar: icon + category label */}
      <div className="workflow-node-header">
        <span className="node-icon" data-category={cat}>{iconEl}</span>
        <span className="node-subtitle">{cfg.label}</span>
      </div>

      {/* Body: title */}
      <div className="workflow-node-text">
        {data.iconPath && (
          <img
            src={data.iconPath}
            alt=""
            style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2 }}
          />
        )}
        <div className="node-title">
          {data.title}
        </div>
      </div>

      {/* Expanded description panel */}
      {(data.subtitle || data.description) && (
        <div
          style={{
            marginTop: 6,
            borderRadius: 12,
            padding: '10px 16px',
            background: selected ? '#22c55e' : '#ccc9c0',
            color: '#000000',
            fontFamily: "var(--font-nunito), 'Nunito', sans-serif",
            fontWeight: 500,
            fontSize: 13,
            lineHeight: 1.45,
            minWidth: 180,
            maxWidth: '100%',
            boxSizing: 'border-box',
            transition: 'background 0.15s ease',
          }}
        >
          {data.subtitle || data.description}
        </div>
      )}

      {/* Single output — right */}
      {!hasMultiOut && (
        <Handle type="source" position={Position.Right} id="out-main" style={{ ...handleStyle, right: -5, top: '50%', transform: 'translateY(-50%)' }} />
      )}

      {/* Multiple outputs (condition nodes) — stacked on right side */}
      {hasMultiOut && (
        <div style={{
          position: 'absolute',
          right: -5,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}>
          {data.outputs!.map((out) => (
            <div key={out.id} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Handle
                id={out.id}
                type="source"
                position={Position.Right}
                style={{ ...handleStyle, position: 'relative', right: 0 }}
              />
              <span style={{ fontSize: 9, color: '#a8a6a2', marginLeft: 4, whiteSpace: 'nowrap' }}>{out.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Hover delete button */}
      <button
        type="button"
        onClick={handleDelete}
        title="Delete node"
        aria-label="Delete node"
        style={{
          position: 'absolute',
          top: -8,
          right: -8,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: 'rgba(248, 113, 113, 0.15)',
          border: '1px solid rgba(248, 113, 113, 0.3)',
          color: '#f87171',
          fontSize: 9,
          fontWeight: 700,
          lineHeight: 1,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0,
          transition: 'opacity 0.15s ease, background 0.15s ease',
          zIndex: 30,
          padding: 0,
        }}
        className="workflow-node-delete-btn"
      >
        ✕
      </button>
    </div>
  );
}

export const WorkflowStepNode = memo(WorkflowStepNodeBase);
