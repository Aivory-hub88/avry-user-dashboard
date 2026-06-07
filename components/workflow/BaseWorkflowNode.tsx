// =============================================================================
// CANONICAL NODE WRAPPER — provides Left/Right ReactFlow handles + hover delete + add-step.
// All node types (StandardNode, WorkflowStepNode) must use this as their outer wrapper.
// =============================================================================
'use client';

import React from 'react';
import { Handle, Position, useReactFlow, useNodeId } from '@xyflow/react';
import styles from './BaseWorkflowNode.module.css';

interface BaseWorkflowNodeProps {
  selected?: boolean;
  onAddStep?: () => void;
  /** If true, hides the target (left) handle — useful for trigger nodes */
  hideTarget?: boolean;
  children: React.ReactNode;
}

/**
 * BaseWorkflowNode
 * Shared wrapper for all canvas nodes. Provides:
 * - Left (target) and Right (source) ReactFlow handles, hover-revealed
 * - A hover-reveal delete button (✕) that removes node + connected edges
 * - A hover-reveal edit button (✎) that opens the inspector panel
 * - A "+" add-step button on the right edge, hover-revealed
 */
export function BaseWorkflowNode({ selected, onAddStep, hideTarget, children }: BaseWorkflowNodeProps) {
  const { setNodes, setEdges } = useReactFlow();
  const nodeId = useNodeId();

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!nodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!nodeId) return;
    // Dispatch custom event for WorkflowCanvas to open inspector
    window.dispatchEvent(new CustomEvent('aivory:edit-node', { detail: { nodeId } }));
  };

  return (
    <div className={`${styles.wrapper} ${selected ? styles.selected : ''}`}>
      {/* Target handle — left */}
      {!hideTarget && (
        <Handle
          type="target"
          position={Position.Left}
          className={styles.handleLeft}
          isConnectable
        />
      )}

      {children}

      {/* Source handle — right */}
      <Handle
        type="source"
        position={Position.Right}
        className={styles.handleRight}
        isConnectable
      />

      {/* Hover edit button */}
      <button
        type="button"
        className={styles.editBtn}
        onClick={(e) => { e.stopPropagation(); handleEdit(e); }}
        title="Edit node"
        aria-label="Edit node"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>

      {/* Hover delete button */}
      <button
        type="button"
        className={styles.deleteBtn}
        onClick={handleDelete}
        title="Delete node"
        aria-label="Delete node"
      >
        ✕
      </button>

      {/* Add-step button */}
      {onAddStep && (
        <button
          type="button"
          className={styles.addBtn}
          onClick={(e) => { e.stopPropagation(); onAddStep(); }}
          title="Add follow-up step with Aivory"
          aria-label="Add follow-up step"
        >
          +
        </button>
      )}
    </div>
  );
}
