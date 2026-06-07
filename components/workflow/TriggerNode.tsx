'use client';

import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { WorkflowNode } from '@/types/workflow';
import styles from './TriggerNode.module.css';

/**
 * Props for the TriggerNode component
 */
interface TriggerNodeProps {
  data: WorkflowNode['data'] & {
    triggerName?: string;
    triggerIcon?: string;
    triggerType?: string;
    onTriggerTypeChange?: (type: string) => void;
  };
  selected: boolean;
}

/**
 * TriggerNode Component
 * Renders a trigger node on the workflow canvas with output handle only
 * Trigger nodes cannot receive connections (no input handle)
 */
const TriggerNode = memo(
  ({ data, selected }: TriggerNodeProps) => {
    const {
      triggerName = 'Trigger',
      triggerIcon = '',
      triggerType = 'manual',
      onTriggerTypeChange,
    } = data;

    return (
      <div className={`${styles.triggerNode} ${selected ? styles.selected : ''}`}>
        {/* Node Header */}
        <div className={styles.nodeHeader}>
          <div className={styles.nodeIcon}>{triggerIcon}</div>
          <div className={styles.nodeName}>{triggerName}</div>
        </div>

        {/* Node Content */}
        <div className={styles.nodeContent}>
          {/* Trigger Type Selector */}
          <div className={styles.nodeField}>
            <label className={styles.nodeLabel}>Type</label>
            <select
              className={styles.nodeSelect}
              value={triggerType}
              onChange={(e) => onTriggerTypeChange?.(e.target.value)}
            >
              <option value="manual">Manual Trigger</option>
              <option value="webhook">Webhook</option>
              <option value="schedule">Schedule</option>
              <option value="email">Email Received</option>
            </select>
          </div>
        </div>

        {/* Output Handle Only — right (source) */}
        <Handle
          type="source"
          position={Position.Right}
          className={styles.handle}
          isConnectable={true}
        />
      </div>
    );
  }
);

TriggerNode.displayName = 'TriggerNode';

export default TriggerNode;
