'use client';
import { asset } from "@/lib/asset";
import Image from 'next/image';

import React, { memo, useState } from 'react';
import { Handle, Position, useReactFlow, useNodeId, useUpdateNodeInternals } from '@xyflow/react';
import {
  Zap, GitFork, Waypoints, Share2, Send, Play, Workflow, BotMessageSquare, Database,
  Clock, Webhook, Braces, Pencil, Timer, Merge, Filter, Mail, Reply, Repeat, MousePointerClick, Globe,
} from 'lucide-react';
import { resolveNodeVisual, type NodeGlyph } from '@/lib/workflows/nodeVisual';
import styles from './WorkflowNode.module.css';

const DESIGN = {
  nodeBg: '#a4a4a4',
  nodeBorderRadius: 16,
  nodePadding: 6,
  nodeWidth: 260,
  upperBg: '#676b69',
  upperBorderRadius: 11,
  iconBoxDefaultColor: '#f5a623',
  iconBoxBorderRadius: 10,
  iconSize: 26,
  titleFont: { size: 15, weight: 700, color: '#ffffff' },
  chevronBtnBg: '#555958',
  chevronBtnBorderRadius: 7,
  connectorDotColor: '#00d9a3',
  connectorDotSize: 12,
  bodyBorderRadius: 11,
  bodyMarginTop: 4,
  bodyText: { size: 14, weight: 700, color: '#1a1a18', lineHeight: 1.55 },
};

const ICON_COLOR: Record<string, string> = {
  ai: '#a78bfa', agent: '#a78bfa', 'ai & llm': '#a78bfa',
  logic: '#fb7185', system: '#fb7185',
  trigger: '#fbbf24', condition: '#fbbf24',
  transform: '#60a5fa', channel: '#60a5fa',
  app: '#fb923c', action: '#fb923c', utility: '#fb923c',
  email: '#fb923c', notification: '#fb923c',
  http: '#60a5fa', api: '#60a5fa',
  database: '#34d399', db: '#34d399',
};

const EYEBROW: Record<string, string> = {
  ai: 'AI', agent: 'Agent', 'ai & llm': 'AI',
  logic: 'Logic', system: 'System',
  trigger: 'Trigger', condition: 'Condition',
  transform: 'Transform', channel: 'Channel',
  app: 'App', action: 'Action', utility: 'Utility',
  email: 'Email', notification: 'Notify',
  http: 'HTTP', api: 'API',
  database: 'Database', db: 'Database',
};

function getIconColor(c?: string) { return ICON_COLOR[c?.toLowerCase() ?? ''] ?? DESIGN.iconBoxDefaultColor; }

const GLYPHS: Record<NodeGlyph, React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>> = {
  clock: Clock, webhook: Webhook, code: Braces, pencil: Pencil, timer: Timer, merge: Merge,
  filter: Filter, mail: Mail, reply: Reply, repeat: Repeat, click: MousePointerClick,
  branch: GitFork, bot: BotMessageSquare, globe: Globe, database: Database,
};

function DefaultIcon({ category }: { category?: string }) {
  const cat = category?.toLowerCase() ?? '';
  const p = { size: DESIGN.iconSize, strokeWidth: 1.9, color: 'currentColor' };
  if (cat === 'ai' || cat === 'agent' || cat === 'ai & llm') return <BotMessageSquare {...p} />;
  if (cat === 'trigger') return <Zap {...p} />;
  if (cat === 'condition') return <GitFork {...p} />;
  if (cat === 'logic' || cat === 'system') return <Waypoints {...p} />;
  if (cat === 'transform') return <Share2 {...p} />;
  if (cat === 'channel' || cat === 'email' || cat === 'notification') return <Send {...p} />;
  if (cat === 'app' || cat === 'action' || cat === 'utility') return <Play {...p} />;
  if (cat === 'http' || cat === 'api') return <Workflow {...p} />;
  if (cat === 'database' || cat === 'db') return <Database {...p} />;
  return <Workflow {...p} />;
}

const SPLIT_CONNECTORS = ['via', 'using', 'with', 'from', 'for', 'based', 'through', 'by', 'and', 'including', 'to'];

function splitLabel(label: string): { short: string; rest: string } {
  const words = label.trim().split(/\s+/);
  if (words.length <= 3) return { short: label, rest: '' };

  let splitIndex = -1;
  for (let i = 2; i < words.length; i++) {
    if (SPLIT_CONNECTORS.includes(words[i].toLowerCase())) {
      splitIndex = i;
      break;
    }
  }

  if (splitIndex === -1) splitIndex = Math.min(3, words.length - 1);

  const short = words.slice(0, splitIndex).join(' ');
  const rest  = words.slice(splitIndex).join(' ');

  if (rest.length < 4) return { short: label, rest: '' };

  return { short, rest };
}

export interface WorkflowNodeData {
  label: string; description?: string; category?: string; icon?: React.ReactNode;
  hideTarget?: boolean; onAddStep?: () => void;
  title?: string; appName?: string; agentName?: string;
  appId?: string; appIcon?: string; iconPath?: string;
  /** Integration id from the generated workflow step (e.g. "gmail", "slack") — primary brand-icon signal */
  app?: string;
  /** Labeled branch outputs (If/Switch/SplitInBatches) — each needs its own named Handle, or edges targeting that handle id silently fail to render. */
  outputs?: { id: string; label: string }[];
  [key: string]: unknown;
}

interface WorkflowNodeProps { data: WorkflowNodeData; selected: boolean; }

export const WorkflowNode = memo(({ data, selected }: WorkflowNodeProps) => {
  const [expanded, setExpanded] = useState(false);
  const label = data.label || data.title || data.appName || data.agentName || 'Step';
  const { description, category, icon, hideTarget = false, onAddStep, appIcon, iconPath, app, outputs } = data;
  const { setNodes, setEdges } = useReactFlow();
  const nodeId = useNodeId();
  const updateNodeInternals = useUpdateNodeInternals();

  const isMulti = !!(outputs && outputs.length > 1);
  // Only Switch-style outputs (out-0, out-1, …) can grow; If/Loop are fixed pairs.
  const canAddBranch = isMulti && outputs!.every((o) => /^out-\d+$/.test(o.id));

  const handleAddBranch = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!nodeId || !outputs) return;
    const hasFallback = outputs[outputs.length - 1]?.label === 'Fallback';
    const ruleCount = hasFallback ? outputs.length - 1 : outputs.length;
    const label = `Output ${ruleCount}`;
    const next = hasFallback
      ? [...outputs.slice(0, -1), { id: `out-${ruleCount}`, label }, { id: `out-${ruleCount + 1}`, label: 'Fallback' }]
      : [...outputs, { id: `out-${ruleCount}`, label }];
    setNodes((nds) => nds.map((n) => {
      if (n.id !== nodeId) return n;
      const raw = (n.data as any).rawN8n;
      const params = raw?.parameters ?? {};
      const values = [...(params.rules?.values ?? []), { outputKey: label }];
      return {
        ...n,
        data: {
          ...n.data,
          outputs: next,
          ...(raw ? { rawN8n: { ...raw, parameters: { ...params, rules: { ...params.rules, values } } } } : {}),
        },
      };
    }));
    // The fallback slides one index to the right — keep its connection attached.
    if (hasFallback) {
      setEdges((eds) => eds.map((ed) =>
        ed.source === nodeId && ed.sourceHandle === `out-${ruleCount}` ? { ...ed, sourceHandle: `out-${ruleCount + 1}` } : ed));
    }
    requestAnimationFrame(() => updateNodeInternals(nodeId));
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!nodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  };

  const handleInfo = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!nodeId) return;
    window.dispatchEvent(new CustomEvent('aivory:edit-node', { detail: { nodeId } }));
  };

  const { short, rest } = splitLabel(label);
  const hasExpandedContent = rest || description;
  const accentColor = getIconColor(category);
  // n8n-style: the icon follows the app the step talks to (Google Drive → Drive logo),
  // built-in nodes get a glyph for what they do (Schedule → clock).
  const rawType = (data.rawN8n as { type?: string } | undefined)?.type;
  const visual = resolveNodeVisual({
    app,
    appIcon: typeof appIcon === 'string' ? appIcon : undefined,
    label,
    description: typeof description === 'string' ? description : undefined,
    rawType,
  });
  const appIconUrl = appIcon && (appIcon.startsWith('/') || appIcon.startsWith('http')) ? appIcon : null;
  const hasBrandIcon = !!(iconPath || appIconUrl || visual.svg);

  const renderIcon = () => {
    const src = iconPath ? asset(iconPath)
      : appIconUrl ? (appIconUrl.startsWith('http') ? appIconUrl : asset(appIconUrl))
      : visual.svg ? asset(visual.svg)
      : null;
    if (src) {
      return (
        <Image src={src} alt={label} width={28} height={28}
          style={{ width: 28, height: 28, objectFit: 'contain' }}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      );
    }
    if (visual.glyph) {
      const G = GLYPHS[visual.glyph];
      return <G size={DESIGN.iconSize} strokeWidth={1.9} color="currentColor" />;
    }
    if (icon && typeof icon !== 'string') return icon;
    return <DefaultIcon category={category} />;
  };

  // 3+ branch outputs (a wide Switch) packed into the default collapsed
  // height leaves adjacent handles only a few px apart — even the tightened
  // connectionRadius (see WorkflowCanvas.tsx) can't fully disambiguate that.
  // Grow the node a bit so handle spacing scales with branch count.
  const minHeight = outputs && outputs.length >= 3 ? 18 * (outputs.length + 1) : undefined;

  return (
    <div
      className={[
        styles.nodeWrapper,
        selected ? styles.selected : '',
        expanded ? styles.expanded : '',
      ].filter(Boolean).join(' ')}
      style={{ '--accent-color': accentColor, ...(minHeight ? { minHeight } : {}) } as React.CSSProperties}
    >

      {/* ── Connector dot LEFT ── */}
      <div className={styles.connectorDotLeft} style={isMulti ? { top: 31 } : undefined} />

      {/* ── Upper bar (always visible) ── */}
      <div className={styles.upperBar}>
        <div className={`${styles.iconBox} ${hasBrandIcon ? styles.iconBrand : styles.iconTint}`}>
          {renderIcon()}
        </div>

        <div className={styles.titleWrap}>
          <span className={styles.eyebrow}>{EYEBROW[category?.toLowerCase() ?? ''] ?? 'Step'}</span>
          <span className={styles.title}>{short}</span>
        </div>

        {hasExpandedContent && (
          <button
            className={styles.chevronBtn}
            onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {expanded
                ? <polyline points="18 15 12 9 6 15" />
                : <polyline points="6 9 12 15 18 9" />
              }
            </svg>
          </button>
        )}
      </div>

      {/* ── Branch rows: one port per output (Switch / If / Loop) ── */}
      {isMulti && (
        <div className={styles.branches}>
          {outputs!.map((output, i) => {
            const isFallback = output.label === 'Fallback';
            return (
              <div key={output.id} className={`${styles.branchRow} ${isFallback ? styles.branchFallback : ''}`}>
                <span className={styles.branchIdx}>{isFallback ? '∅' : i + 1}</span>
                <span className={styles.branchLabel}>{isFallback ? 'No condition matched' : output.label}</span>
                <div className={styles.branchDot} />
                <Handle type="source" id={output.id} position={Position.Right} className={styles.branchHandle} />
              </div>
            );
          })}
          {canAddBranch && (
            <button type="button" className={styles.branchAdd} onClick={handleAddBranch} title="Add branch" aria-label="Add branch">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          )}
        </div>
      )}

      {/* ── Body (expanded only) ── */}
      {expanded && hasExpandedContent && (
        <div
          className={styles.nodeBody}
          data-category={category}
        >
          {rest && (
            <span className={styles.restTitle}>
              {rest}
            </span>
          )}
          {description && (
            <span className={styles.descriptionText}>
              {description}
            </span>
          )}
        </div>
      )}

      {/* ── Action buttons ── */}
      <div className={styles.actionButtons}>
        <button className={`${styles.actionBtn} ${styles.infoBtn}`} onClick={handleInfo} title="Edit node" aria-label="Edit node">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </button>
        {onAddStep && (
          <button className={`${styles.actionBtn} ${styles.addBtn}`} onClick={(e) => { e.stopPropagation(); onAddStep(); }} title="Add step" aria-label="Add step">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
        <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={handleDelete} title="Delete node" aria-label="Delete node">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* ── ReactFlow handles ── */}
      {!hideTarget && <Handle type="target" position={Position.Left} className={styles.handle} style={isMulti ? { top: 31 } : undefined} />}

      {/* Multi-output nodes (If/Switch/SplitInBatches) need one NAMED handle
          per branch — edges carry a matching sourceHandle id (out-yes/out-0/…)
          and @xyflow/react can't resolve an edge whose handle id doesn't
          exist on the node, so it silently drops the connecting line. */}
      {!isMulti && (
        <>
          <div className={styles.connectorDotRight} />
          <Handle type="source" position={Position.Right} className={styles.handle} />
        </>
      )}
    </div>
  );
});

WorkflowNode.displayName = 'WorkflowNode';
export default WorkflowNode;