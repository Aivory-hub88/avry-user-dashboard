'use client';

import React, { memo, useState } from 'react';
import { Handle, Position, useReactFlow, useNodeId } from '@xyflow/react';
import {
  Zap, GitFork, Waypoints, Share2, Send, Play, Workflow, BotMessageSquare,
} from 'lucide-react';
import styles from './WorkflowNode.module.css';

// ── Category → bottom panel pastel color mapping ──
const BODY_BG_COLORS: Record<string, string> = {
  // AI / analysis / prediction
  ai: '#b8f5e0', agent: '#b8f5e0', 'ai & llm': '#b8f5e0',
  // Logic / conditions / branching
  logic: '#e3d7fb', system: '#e3d7fb',
  // Trigger / condition
  trigger: '#fcefb0', condition: '#fcefb0',
  // Transform / data movement / channels
  transform: '#d1e4ff', channel: '#d1e4ff',
  // App / action / utility
  app: '#fcefb0', action: '#fcefb0', utility: '#fcefb0',
  // Email / notification / communication
  email: '#fcefb0', notification: '#fcefb0',
  // HTTP / API
  http: '#d1e4ff', api: '#d1e4ff',
  // Database
  database: '#b8f5e0', db: '#b8f5e0',
};

function getBodyBgColor(c?: string) { return BODY_BG_COLORS[c?.toLowerCase() ?? ''] ?? '#e1ded7'; }

const DESIGN = {
  nodeBg: '#a4a4a4',
  nodeBorderRadius: 16,
  nodePadding: 6,
  nodeWidth: 260,
  upperBg: '#676b69',
  upperBorderRadius: 11,
  iconBoxDefaultColor: '#f5a623',
  iconBoxBorderRadius: 10,
  iconSize: 22,
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
  ai: '#7c3aed', agent: '#7c3aed', 'ai & llm': '#7c3aed',
  logic: '#dc2626', system: '#dc2626',
  trigger: '#f5a623', condition: '#f5a623',
  transform: '#2563eb', channel: '#2563eb',
  app: '#f5a623', action: '#f5a623', utility: '#f5a623',
  email: '#f5a623', notification: '#f5a623',
  http: '#2563eb', api: '#2563eb',
  database: '#059669', db: '#059669',
};

function getIconColor(c?: string) { return ICON_COLOR[c?.toLowerCase() ?? ''] ?? DESIGN.iconBoxDefaultColor; }

const APP_ICON_MAP: Record<string, string> = {
  hubspot: '/icons/integrations/hubspot.svg',
  airtable: '/icons/integrations/airtable.svg',
  'amazon s3': '/icons/integrations/amazon-s3.svg',
  asana: '/icons/integrations/asana.svg',
  dropbox: '/icons/integrations/dropbox.svg',
  gmail: '/icons/integrations/gmail.svg',
  'google sheets': '/icons/integrations/google-sheets.svg',
  'google calendar': '/icons/integrations/google-calendar.svg',
  'google drive': '/icons/integrations/google-drive.svg',
  http: '/icons/integrations/http.svg',
  intercom: '/icons/integrations/intercom.svg',
  linear: '/icons/integrations/linear.svg',
  mailchimp: '/icons/integrations/mailchimp.svg',
  'microsoft teams': '/icons/integrations/microsoft-teams.svg',
  outlook: '/icons/integrations/outlook.svg',
  notion: '/icons/integrations/notion.svg',
  openai: '/icons/integrations/openai.svg',
  salesforce: '/icons/integrations/salesforce.svg',
  sendgrid: '/icons/integrations/sendgrid.svg',
  shopify: '/icons/integrations/shopify.svg',
  slack: '/icons/integrations/slack.svg',
  stripe: '/icons/integrations/stripe.svg',
  twilio: '/icons/integrations/twilio.svg',
  zendesk: '/icons/integrations/zendesk.svg',
};

function getAppSvgIcon(label: string): string | null {
  const key = label.toLowerCase().trim();
  if (APP_ICON_MAP[key]) return APP_ICON_MAP[key];
  for (const [k, v] of Object.entries(APP_ICON_MAP)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

function DefaultIcon({ category }: { category?: string }) {
  const cat = category?.toLowerCase() ?? '';
  const p = { size: DESIGN.iconSize, color: 'white', strokeWidth: 2 };
  if (cat === 'ai' || cat === 'agent' || cat === 'ai & llm') return <BotMessageSquare {...p} />;
  if (cat === 'trigger') return <Zap {...p} />;
  if (cat === 'condition') return <GitFork {...p} />;
  if (cat === 'logic' || cat === 'system') return <Waypoints {...p} />;
  if (cat === 'transform') return <Share2 {...p} />;
  if (cat === 'channel' || cat === 'email' || cat === 'notification') return <Send {...p} />;
  if (cat === 'app' || cat === 'action' || cat === 'utility') return <Play {...p} />;
  if (cat === 'http' || cat === 'api') return <Workflow {...p} />;
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
  [key: string]: unknown;
}

interface WorkflowNodeProps { data: WorkflowNodeData; selected: boolean; }

export const WorkflowNode = memo(({ data, selected }: WorkflowNodeProps) => {
  const [expanded, setExpanded] = useState(false);
  const label = data.label || data.title || data.appName || data.agentName || 'Step';
  const { description, category, icon, hideTarget = false, onAddStep, appIcon, iconPath } = data;
  const { setNodes, setEdges } = useReactFlow();
  const nodeId = useNodeId();

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
  const bodyBgColor = getBodyBgColor(category);

  const renderIcon = () => {
    if (iconPath) {
      return (
        <img src={iconPath} alt={label}
          style={{ width: 36, height: 36, objectFit: 'contain' }}
          onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.removeAttribute('style'); }}
        />
      );
    }
    if (appIcon) {
      if (appIcon.startsWith('/') || appIcon.startsWith('http')) {
        return (
          <img src={appIcon} alt={label}
            style={{ width: 36, height: 36, objectFit: 'contain' }}
            onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.removeAttribute('style'); }}
          />
        );
      }
      const svgPath = getAppSvgIcon(label);
      if (svgPath) {
        return (
          <img src={svgPath} alt={label}
            style={{ width: 36, height: 36, objectFit: 'contain' }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        );
      }
    }
    if (icon && typeof icon !== 'string') return icon;
    return <DefaultIcon category={category} />;
  };

  return (
    <div className={[
      styles.nodeWrapper,
      selected ? styles.selected : '',
      expanded ? styles.expanded : '',
    ].filter(Boolean).join(' ')}>

      {/* ── Connector dot LEFT ── */}
      <div className={styles.connectorDotLeft} />

      {/* ── Connector dot RIGHT ── */}
      <div className={styles.connectorDotRight} />

      {/* ── Upper bar (always visible) ── */}
      <div className={styles.upperBar}>
        <div className={styles.iconBox}>
          {renderIcon()}
        </div>

        <span className={styles.title}>{short}</span>

        {hasExpandedContent && (
          <button
            className={styles.chevronBtn}
            onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#ccc" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {expanded
                ? <polyline points="18 15 12 9 6 15" />
                : <polyline points="6 9 12 15 18 9" />
              }
            </svg>
          </button>
        )}
      </div>

      {/* ── Body (expanded only) ── */}
      {expanded && hasExpandedContent && (
        <div
          className={styles.nodeBody}
          data-category={category}
          style={{
            '--body-bg': bodyBgColor,
          } as React.CSSProperties}
        >
          {rest && (
            <span className={styles.restTitle} style={{ display: 'block', color: DESIGN.bodyText.color }}>
              {rest}
            </span>
          )}
          {description && (
            <span className={styles.descriptionText} style={{ display: 'block', color: DESIGN.bodyText.color }}>
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
      {!hideTarget && <Handle type="target" position={Position.Left} className={styles.handle} />}
      <Handle type="source" position={Position.Right} className={styles.handle} />
    </div>
  );
});

WorkflowNode.displayName = 'WorkflowNode';
export default WorkflowNode;