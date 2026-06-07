'use client';

import React, { useState } from 'react';
import styles from './StandardNodePalette.module.css';

export interface StandardNodeDef {
  type: string;
  label: string;
  icon: React.ReactNode;
  iconKey: string; // string key for serialization
  category: 'trigger' | 'logic' | 'transform' | 'utility' | 'ai';
  description?: string;
}

// Clean SVG icons — no emoji
const Icons: Record<string, React.ReactNode> = {
  webhook: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  ),
  schedule: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  manual: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  ),
  branch: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
      <path d="M6 9v6"/><path d="M9 6h6a3 3 0 0 1 3 3v6"/>
    </svg>
  ),
  switch: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 3 21 3 21 8"/>
      <line x1="4" y1="20" x2="21" y2="3"/>
      <polyline points="21 16 21 21 16 21"/>
      <line x1="15" y1="15" x2="21" y2="21"/>
    </svg>
  ),
  edit: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  code: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6"/>
      <polyline points="8 6 2 12 8 18"/>
    </svg>
  ),
  aggregate: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/>
      <line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  ),
  http: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  ),
  respond: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 14 4 9 9 4"/>
      <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
    </svg>
  ),
  agent: (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/icons/ai-agent.svg" alt="AI Agent" width={15} height={15} style={{ objectFit: 'contain' }} />
  ),
};

export const STANDARD_NODES: StandardNodeDef[] = [
  // Triggers
  { type: 'standardNode', label: 'Webhook',            iconKey: 'webhook',   icon: Icons.webhook,   category: 'trigger',   description: 'Receive HTTP requests' },
  { type: 'standardNode', label: 'Schedule',           iconKey: 'schedule',  icon: Icons.schedule,  category: 'trigger',   description: 'Run on a cron schedule' },
  { type: 'standardNode', label: 'Manual Trigger',     iconKey: 'manual',    icon: Icons.manual,    category: 'trigger',   description: 'Start workflow manually' },
  // Logic
  { type: 'standardNode', label: 'If',                 iconKey: 'branch',    icon: Icons.branch,    category: 'logic',     description: 'Branch on a condition' },
  { type: 'standardNode', label: 'Switch',             iconKey: 'switch',    icon: Icons.switch,    category: 'logic',     description: 'Route to multiple branches' },
  // Transform
  { type: 'standardNode', label: 'Edit Fields',        iconKey: 'edit',      icon: Icons.edit,      category: 'transform', description: 'Map and rename fields' },
  { type: 'standardNode', label: 'Code',               iconKey: 'code',      icon: Icons.code,      category: 'transform', description: 'Run custom JavaScript' },
  { type: 'standardNode', label: 'Aggregate',          iconKey: 'aggregate', icon: Icons.aggregate, category: 'transform', description: 'Merge multiple items' },
  // AI
  { type: 'agent', label: 'Agent',                     iconKey: 'agent',     icon: Icons.agent,     category: 'ai',        description: 'Run an AI agent' },
  // Utility
  { type: 'standardNode', label: 'HTTP Request',       iconKey: 'http',      icon: Icons.http,      category: 'utility',   description: 'Call any REST API' },
  { type: 'standardNode', label: 'Respond to Webhook', iconKey: 'respond',   icon: Icons.respond,   category: 'utility',   description: 'Send HTTP response' },
];

const CATEGORY_LABELS: Record<StandardNodeDef['category'], string> = {
  trigger:   'Triggers',
  logic:     'Logic',
  transform: 'Transform',
  utility:   'Utility',
  ai:        'AI',
};

interface Props {
  onDragStart?: (e: React.DragEvent, node: StandardNodeDef) => void;
}

export function StandardNodePalette({ onDragStart }: Props) {
  const [open, setOpen] = useState(true);

  const handleDragStart = (e: React.DragEvent, node: StandardNodeDef) => {
    e.dataTransfer.effectAllowed = 'move';
    // Serialize with iconKey (not the ReactNode) so it can be JSON-stringified
    e.dataTransfer.setData('application/aivory-standard-node', JSON.stringify({ ...node, icon: node.iconKey }));
    onDragStart?.(e, node);
  };

  const categories = (Object.keys(CATEGORY_LABELS) as StandardNodeDef['category'][]);

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader} onClick={() => setOpen(v => !v)}>
        <span className={styles.sectionTitle}>Standard Nodes</span>
        <span className={`${styles.chevron} ${open ? styles.open : ''}`}>›</span>
      </div>

      {open && (
        <div className={styles.nodeList}>
          {categories.map(cat => {
            const nodes = STANDARD_NODES.filter(n => n.category === cat);
            return (
              <React.Fragment key={cat}>
                <div style={{ padding: '4px 4px 2px', fontSize: 9, fontWeight: 700, color: '#3a3a38', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {CATEGORY_LABELS[cat]}
                </div>
                {nodes.map(node => (
                  <div
                    key={node.label}
                    className={styles.nodeCard}
                    draggable
                    onDragStart={e => handleDragStart(e, node)}
                    title={node.description}
                  >
                    <div className={styles.nodeIcon}>{node.icon}</div>
                    <div className={styles.nodeInfo}>
                      <span className={styles.nodeName}>{node.label}</span>
                      {node.description && (
                        <span className={styles.nodeCategory}>{node.description}</span>
                      )}
                    </div>
                  </div>
                ))}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
