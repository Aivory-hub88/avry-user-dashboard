'use client';

import React, { memo, useState } from 'react';
import { Handle, Position, useReactFlow, useNodeId } from '@xyflow/react';
import { WorkflowNode } from '@/types/workflow';
import { getNodeIcon } from '@/lib/nodeIcons';
import styles from './AppNode.module.css';

interface StandardNodeProps {
  data: WorkflowNode['data'] & {
    label?: string;
    description?: string;
    onDelete?: () => void;
    onAddStep?: () => void;
    onExplainPath?: () => void;
  };
  selected: boolean;
  isConnecting: boolean;
}

const StandardNode = memo(({ data, selected, isConnecting }: StandardNodeProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const { label = 'Step', description = '', onDelete, onAddStep, onExplainPath } = data;

  const { setNodes, setEdges } = useReactFlow();
  const nodeId = useNodeId();

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete();
    } else if (nodeId) {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    }
  };

  return (
    <div className={`${styles.appNode} ${selected ? styles.selected : ''} ${isConnecting ? styles.connecting : ''}`}>
      <Handle type="target" position={Position.Left} className={styles.handle} isConnectable={!isConnecting} />

      {/* TOP — always visible */}
      <div className={`${styles.nodeHeader} ${isExpanded ? styles.headerExpanded : ''}`}>
        <div className={styles.nodeIcon}>
          {getNodeIcon(label)}
        </div>
        <div className={styles.nodeName}>{label}</div>
        <button
          className={`${styles.expandChevron} ${isExpanded ? styles.expanded : ''}`}
          onClick={(e) => { e.stopPropagation(); setIsExpanded(prev => !prev); }}
          title={isExpanded ? 'Collapse' : 'Expand'}
          aria-label={isExpanded ? 'Collapse node' : 'Expand node'}
        >
          &#8963;
        </button>
      </div>

      {/* BOTTOM — only in DOM when expanded */}
      {isExpanded && description && (
        <div className={styles.nodeContent}>
          <p style={{ margin: 0, fontSize: '13px', color: '#000000', lineHeight: 1.5 }}>
            {description}
          </p>
        </div>
      )}

      {/* Hover action buttons */}
      <button className={styles.infoButton} onClick={onExplainPath} title="Explain path">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </button>
      <button className={styles.addButton} onClick={onAddStep} title="Add step">+</button>
      <button className={styles.deleteButton} onClick={handleDelete} title="Delete node">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      <Handle type="source" position={Position.Right} className={styles.handle} isConnectable={!isConnecting} />
    </div>
  );
});

StandardNode.displayName = 'StandardNode';
export default StandardNode;
