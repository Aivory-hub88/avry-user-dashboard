// nextjs-console/components/workflow/DynamicNodePalette.tsx
'use client';

import React, { useState, useMemo } from 'react';
import { NODE_PALETTE, QUICK_ACCESS, type NodeDefinition } from '../../config/workflow-nodes';
import { NODE_ICONS, DefaultIcon } from '../../config/node-icons';
import styles from './StandardNodePalette.module.css'; // Reuse existing styles

interface Props {
  onDragStart?: (e: React.DragEvent, node: NodeDefinition) => void;
}

export function DynamicNodePalette({ onDragStart }: Props) {
  const [open, setOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredNodes = useMemo(() => {
    if (!searchQuery) return NODE_PALETTE;
    return NODE_PALETTE.filter(node =>
      node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  const groupedNodes = useMemo(() => {
    const groups: Record<string, NodeDefinition[]> = {};
    filteredNodes.forEach(node => {
      if (!groups[node.category]) groups[node.category] = [];
      groups[node.category].push(node);
    });
    return groups;
  }, [filteredNodes]);

  const handleDragStart = (e: React.DragEvent, node: NodeDefinition) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/aivory-node', JSON.stringify(node));
    onDragStart?.(e, node);
  };

  const getIcon = (type: string) => {
    return NODE_ICONS[type] || <DefaultIcon />;
  };

  const categoryColors: Record<string, string> = {
    'Triggers': '#F59E0B',
    'Logic': '#8B5CF6',
    'Transform': '#10B981',
    'AI & LLM': '#EC4899',
    'Communication': '#3B82F6',
    'Data & Storage': '#F97316',
    'Productivity': '#06B6D4',
    'Utilities': '#6B7280',
    'Custom': '#8B5CF6',
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader} onClick={() => setOpen(v => !v)}>
        <span className={styles.sectionTitle}>Node Palette</span>
        <span className={`${styles.chevron} ${open ? styles.open : ''}`}>›</span>
      </div>

      {open && (
        <>
          {/* Search Bar */}
          <div style={{ padding: '8px 4px' }}>
            <input
              type="text"
              placeholder="Search nodes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '12px',
                backgroundColor: '#fff',
                color: '#374151',
              }}
            />
          </div>

          {/* Quick Access */}
          {QUICK_ACCESS.length > 0 && !searchQuery && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ padding: '4px 4px 2px', fontSize: 9, fontWeight: 700, color: '#3a3a38', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Quick Add
              </div>
              <div className={styles.nodeList}>
                {QUICK_ACCESS.map(nodeType => {
                  const node = NODE_PALETTE.find(n => n.type === nodeType);
                  if (!node) return null;
                  return (
                    <div
                      key={node.type}
                      className={styles.nodeCard}
                      draggable
                      onDragStart={e => handleDragStart(e, node)}
                      title={node.description}
                    >
                      <div className={styles.nodeIcon}>{getIcon(node.type)}</div>
                      <div className={styles.nodeInfo}>
                        <span className={styles.nodeName}>{node.label}</span>
                        {node.description && (
                          <span className={styles.nodeCategory}>{node.description}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Categories */}
          <div className={styles.nodeList}>
            {Object.entries(groupedNodes).map(([category, nodes]) => (
              <React.Fragment key={category}>
                <div
                  style={{
                    padding: '4px 4px 2px',
                    fontSize: 9,
                    fontWeight: 700,
                    color: categoryColors[category] || '#3a3a38',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}
                >
                  {category}
                </div>
                {nodes.map(node => (
                  <div
                    key={node.type}
                    className={styles.nodeCard}
                    draggable
                    onDragStart={e => handleDragStart(e, node)}
                    title={node.description}
                  >
                    <div className={styles.nodeIcon}>{getIcon(node.type)}</div>
                    <div className={styles.nodeInfo}>
                      <span className={styles.nodeName}>{node.label}</span>
                      {node.description && (
                        <span className={styles.nodeCategory}>{node.description}</span>
                      )}
                    </div>
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        </>
      )}
    </div>
  );
}