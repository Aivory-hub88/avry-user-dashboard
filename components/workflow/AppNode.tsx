'use client';

import React, { memo, useState } from 'react';
import { Handle, Position, useReactFlow, useNodeId } from '@xyflow/react';
import { WorkflowNode } from '@/types/workflow';
import styles from './AppNode.module.css';

interface AppNodeProps {
  data: WorkflowNode['data'] & {
    appName?: string;
    appIcon?: string;
    connectionName?: string;
    action?: string;
    onActionChange?: (action: string) => void;
    onConnectionChange?: (connectionId: string) => void;
    onDelete?: () => void;
    onAddStep?: () => void;
    onExplainPath?: () => void;
  };
  selected: boolean;
  isConnecting: boolean;
}

const AppNode = memo(({ data, selected, isConnecting }: AppNodeProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const {
    appName = 'App',
    appIcon = '',
    connectionName,
    action,
    onActionChange,
    onConnectionChange,
    onDelete,
    onAddStep,
    onExplainPath,
  } = data;

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
          {appIcon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={appIcon} alt="" width={32} height={32} style={{ objectFit: 'contain' }} />
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          )}
        </div>
        <div className={styles.nodeName}>{appName}</div>
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
      {isExpanded && (
        <div className={styles.nodeContent}>
          <div className={styles.nodeField}>
            <label className={styles.nodeLabel}>Action</label>
            <select
              className={styles.nodeSelect}
              value={action || ''}
              onChange={(e) => onActionChange?.(e.target.value)}
            >
              <option value="">Select Action</option>
              <option value="send_message">Send Message</option>
              <option value="create_item">Create Item</option>
              <option value="update_item">Update Item</option>
              <option value="delete_item">Delete Item</option>
            </select>
          </div>
          <div className={styles.nodeField}>
            <label className={styles.nodeLabel}>Connection</label>
            {connectionName ? (
              <div className={styles.connectionDisplay} onClick={() => onConnectionChange?.('')}>
                {connectionName}
              </div>
            ) : (
              <div className={styles.connectionWarning} onClick={() => onConnectionChange?.('')}>
                No connection
              </div>
            )}
          </div>
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

AppNode.displayName = 'AppNode';
export default AppNode;
